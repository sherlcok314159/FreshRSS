<?php

class KagiSummarizerDAO extends Minz_ModelPdo {
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

class FreshExtension_kagiSummarizer_Controller extends Minz_ActionController {
  public function kagiStringsAction() {
    $this->view->kagi_strings = json_encode(array(
      'loading_summary' => _t('ext.kagiSummarizer.ui.loading_summary'),
      'error' => _t('ext.kagiSummarizer.ui.error')
    ));
    $this->view->_layout(false);
    $this->view->_path('kagiSummarizer/strings.js');
    header('Content-Type: application/javascript; charset=UTF-8');
  }

  private static function isValidSummary(string $text): bool {
    $stripped = trim(strip_tags($text));
    if ($stripped === '') {
      return false;
    }
    $badPatterns = array(
      '/Title:\s*Access Restricted/i',
      '/Title:\s*Access Denied/i',
      '/Title:\s*40[0-9]/i',
      '/Title:\s*50[0-9]/i',
      '/Access Denied/i',
      '/403\s+Forbidden/i',
      '/Page Not Found/i',
      '/^Error\s+\d{3}/i',
    );
    foreach ($badPatterns as $pattern) {
      if (preg_match($pattern, $stripped)) {
        return false;
      }
    }
    return true;
  }

  public function summarizeAction() {
    $this->view->_layout(false);

    $kagi_token = FreshRSS_Context::$user_conf->kagi_token;
    $kagi_language = FreshRSS_Context::$user_conf->kagi_language;

    if ($kagi_token === null || trim($kagi_token) === '') {
      echo json_encode(array(
        'response' => array(
          'output_text' => _t('ext.kagiSummarizer.ui.no_token_configured'),
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

    $type = Minz_Request::param('type');
    $entry_link = urlencode($entry->link());
    $url = 'https://kagi.com/mother/summary_labs'
      . '?summary_type=' . $type
      . '&target_language=' . $kagi_language
      . '&url=' . $entry_link;

    $curl = curl_init();
    curl_setopt($curl, CURLOPT_URL, $url);
    curl_setopt($curl, CURLOPT_HTTPHEADER, array(
      'Content-Type: application/json; charset=UTF-8',
      'Authorization: ' . $kagi_token
    ));
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($curl);
    $http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    $responseData = json_decode($response, true);

    if ($http_code == 200 && $responseData && isset($responseData['output_text']) && !isset($responseData['error'])
        && self::isValidSummary($responseData['output_text'])) {
      $attr_key = 'kagi_' . $type;
      $entry->_attribute($attr_key, $responseData['output_text']);
      $dao = new KagiSummarizerDAO();
      $dao->updateEntryAttributes(
        $entry->id(),
        json_encode($entry->attributes(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
      );
    }

    echo json_encode(array(
      'response' => $responseData,
      'status' => $http_code
    ));
  }
}
