<?php

class GeminiAssistantDAO extends Minz_ModelPdo {
  public function updateEntryAttributes(string $entryId, string $attributesJson): bool {
    $sql = 'UPDATE `_entry` SET attributes = :attributes WHERE id = :id';
    $stm = $this->pdo->prepare($sql);
    if ($stm) {
      $stm->bindValue(':attributes', $attributesJson);
      $stm->bindValue(':id', $entryId);
      return $stm->execute();
    }
    return false;
  }
}

class FreshExtension_geminiAssistant_Controller extends Minz_ActionController {
  const DEFAULT_SUMMARY_PROMPT = "请用简洁、客观的中文总结下面这篇文章的要点,使用项目符号列出关键信息,保留重要数据和结论。文章标题: {title}\n\n文章正文:\n{content}";

  public function geminiStringsAction() {
    $this->view->gemini_strings = json_encode(array(
      'loading' => _t('ext.geminiAssistant.ui.loading'),
      'error' => _t('ext.geminiAssistant.ui.error')
    ));
    $this->view->_layout(false);
    $this->view->_path('geminiAssistant/strings.js');
    header('Content-Type: application/javascript; charset=UTF-8');
  }

  private static function htmlToText(string $html): string {
    $text = preg_replace('#<(script|style)[^>]*>.*?</\\1>#is', '', $html);
    $text = preg_replace('#<br\s*/?>#i', "\n", $text);
    $text = preg_replace('#</(p|div|li|h[1-6])>#i', "\n", $text);
    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/[ \t]+/", ' ', $text);
    $text = preg_replace("/\n{3,}/", "\n\n", $text);
    return trim($text);
  }

  private static function callGemini(string $apiKey, string $model, string $prompt, string $thinkingLevel): array {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
      . rawurlencode($model) . ':generateContent?key=' . rawurlencode($apiKey);

    $body = array(
      'contents' => array(
        array(
          'role' => 'user',
          'parts' => array(array('text' => $prompt)),
        ),
      ),
    );
    if ($thinkingLevel !== '' && $thinkingLevel !== 'NONE') {
      $body['generationConfig'] = array(
        'thinkingConfig' => array('thinkingLevel' => $thinkingLevel),
      );
    }

    $curl = curl_init();
    curl_setopt($curl, CURLOPT_URL, $url);
    curl_setopt($curl, CURLOPT_POST, true);
    curl_setopt($curl, CURLOPT_HTTPHEADER, array('Content-Type: application/json; charset=UTF-8'));
    curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_TIMEOUT, 180);
    $response = curl_exec($curl);
    $http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $err = curl_error($curl);
    curl_close($curl);

    if ($response === false) {
      return array('http_code' => 0, 'text' => '', 'error' => $err ?: 'curl error');
    }
    $data = json_decode($response, true);
    if ($http_code !== 200) {
      $msg = isset($data['error']['message']) ? $data['error']['message'] : ('HTTP ' . $http_code);
      return array('http_code' => $http_code, 'text' => '', 'error' => $msg);
    }

    $text = '';
    if (isset($data['candidates']) && is_array($data['candidates'])) {
      foreach ($data['candidates'] as $cand) {
        if (isset($cand['content']['parts']) && is_array($cand['content']['parts'])) {
          foreach ($cand['content']['parts'] as $part) {
            if (isset($part['text'])) {
              $text .= $part['text'];
            }
          }
        }
      }
    }
    if ($text === '') {
      return array('http_code' => $http_code, 'text' => '', 'error' => 'empty response');
    }
    return array('http_code' => $http_code, 'text' => $text, 'error' => null);
  }

  public function processAction() {
    $this->view->_layout(false);
    header('Content-Type: application/json; charset=UTF-8');

    $conf = FreshRSS_Context::$user_conf;
    $api_key = $conf->gemini_api_key;
    if ($api_key === null || trim($api_key) === '') {
      echo json_encode(array(
        'response' => array(
          'output_text' => _t('ext.geminiAssistant.ui.no_key_configured'),
          'error' => 'configuration'),
        'status' => 200));
      return;
    }

    $entry_id = Minz_Request::param('id');
    $entry_dao = FreshRSS_Factory::createEntryDao();
    $entry = $entry_dao->searchById($entry_id);
    if ($entry === null) {
      echo json_encode(array('status' => 404));
      return;
    }

    $model = $conf->gemini_model;
    if ($model === null || $model === '') { $model = 'gemini-3-flash-preview'; }
    $thinking = $conf->gemini_thinking_level;
    if ($thinking === null || $thinking === '') { $thinking = 'LOW'; }

    $title = $entry->title();
    $rawHtml = $entry->content(false);
    if ($rawHtml === '') { $rawHtml = $entry->originalContent(); }
    if ($rawHtml === '') { $rawHtml = $entry->content(); }
    $content = self::htmlToText($rawHtml);
    if ($content === '') {
      echo json_encode(array(
        'response' => array(
          'output_text' => 'Empty entry content (raw html length=' . strlen($rawHtml)
            . ', entry id=' . $entry->id() . ', link=' . $entry->link() . ').',
          'error' => 'empty_content',
        ),
        'status' => 200,
      ));
      return;
    }
    if (mb_strlen($content) > 60000) {
      $content = mb_substr($content, 0, 60000);
    }

    $template = $conf->gemini_summary_prompt;
    if ($template === null || trim($template) === '') {
      $template = self::DEFAULT_SUMMARY_PROMPT;
    }

    $prompt = strtr($template, array(
      '{title}' => $title,
      '{content}' => $content,
    ));

    $result = self::callGemini($api_key, $model, $prompt, $thinking);

    if ($result['error'] === null && $result['text'] !== '') {
      $entry->_attribute('gemini_summary', $result['text']);
      $dao = new GeminiAssistantDAO();
      $dao->updateEntryAttributes(
        $entry->id(),
        json_encode($entry->attributes(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
      );
      echo json_encode(array(
        'response' => array('output_text' => $result['text']),
        'status' => 200,
      ));
      return;
    }

    echo json_encode(array(
      'response' => array(
        'output_text' => $result['error'] ?: 'unknown error',
        'error' => 'api',
      ),
      'status' => $result['http_code'] ?: 500,
    ));
  }
}
