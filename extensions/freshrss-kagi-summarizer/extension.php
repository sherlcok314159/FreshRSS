<?php

class KagiSummarizerExtension extends Minz_Extension {
  public function init() {
    $this->registerTranslates();
    $this->registerHook('entry_before_display', [$this, 'addSummarizeButton']);
    Minz_View::appendScript($this->getFileUrl('script.js', 'js'), false, false, false);
    Minz_View::appendStyle($this->getFileUrl('style.css', 'css'));
    Minz_View::appendScript(_url('kagiSummarizer', 'kagiStrings'), false, true, false);
    $this->registerViews();
    $this->registerController('kagiSummarizer');
  }

  public function handleConfigureAction() {
    $this->registerTranslates();
    if (Minz_Request::isPost()) {
      $kagi_token = Minz_Request::param('kagi_token', '');
      $prefix = 'https://kagi.com/search?token=';
      if (substr($kagi_token, 0, strlen($prefix)) == $prefix) {
        $kagi_token = substr($kagi_token, strlen($prefix));
      }
      FreshRSS_Context::$user_conf->kagi_token = $kagi_token;
      FreshRSS_Context::$user_conf->kagi_language = Minz_Request::param('kagi_language', '');
      FreshRSS_Context::$user_conf->kagi_custom_css = Minz_Request::param('kagi_custom_css', '');
      FreshRSS_Context::$user_conf->save();
    }
  }

  private static function isApiRequest(): bool {
    return strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false;
  }

  public function addSummarizeButton(FreshRSS_Entry $entry): FreshRSS_Entry {
    $cached_summary = $entry->attributeString('kagi_summary');
    $cached_takeaway = $entry->attributeString('kagi_takeaway');

    if (self::isApiRequest()) {
      $prepend = '';
      if ($cached_summary !== null && $cached_summary !== '') {
        $prepend .= '<blockquote>' . $cached_summary . '</blockquote>';
      }
      if ($cached_takeaway !== null && $cached_takeaway !== '') {
        $prepend .= '<blockquote>' . $cached_takeaway . '</blockquote>';
      }
      if ($prepend !== '') {
        $entry->_content($prepend . $entry->content());
      }
      return $entry;
    }

    $this->registerTranslates();
    $custom_css = FreshRSS_Context::$user_conf->kagi_custom_css;
    $url_summary = Minz_Url::display(array(
      'c' => 'kagiSummarizer',
      'a' => 'summarize',
      'params' => array(
        'id' => $entry->id(),
        'type' => 'summary',
      )));
    $url_key_moments = Minz_Url::display(array(
      'c' => 'kagiSummarizer',
      'a' => 'summarize',
      'params' => array(
        'id' => $entry->id(),
        'type' => 'takeaway',
      )));

    $summary_html = '';
    $summary_class = 'kagi-content hidden';
    $summary_style = '';
    if ($cached_summary !== null && $cached_summary !== '') {
      $summary_html = str_replace(array("\r\n", "\r", "\n"), '<br>', $cached_summary);
      $summary_class = 'kagi-content';
      $summary_style = $custom_css;
    }

    $takeaway_html = '';
    $takeaway_class = 'kagi-content hidden';
    $takeaway_style = '';
    if ($cached_takeaway !== null && $cached_takeaway !== '') {
      $takeaway_html = str_replace(array("\r\n", "\r", "\n"), '<br>', $cached_takeaway);
      $takeaway_class = 'kagi-content';
      $takeaway_style = $custom_css;
    }

    $entry->_content(
      '<div class="kagi-summary">'
      . '<div class="kagi-buttons">'
      . '<a class="btn" href="' . $url_summary . '" data-kagi-type="summary">'
      . _t('ext.kagiSummarizer.ui.summarize_button') . '</a>'
      . '<a class="btn" href="' . $url_key_moments . '" data-kagi-type="takeaway">'
      . _t('ext.kagiSummarizer.ui.key_moments_button') . '</a>'
      . '</div>'
      . '<div class="kagi-result" data-kagi-type="summary">'
      . '<p class="kagi-status hidden alert"></p>'
      . '<blockquote class="' . $summary_class . '" data-css="' . $custom_css . '" style="' . $summary_style . '">'
      . $summary_html . '</blockquote>'
      . '</div>'
      . '<div class="kagi-result" data-kagi-type="takeaway">'
      . '<p class="kagi-status hidden alert"></p>'
      . '<blockquote class="' . $takeaway_class . '" data-css="' . $custom_css . '" style="' . $takeaway_style . '">'
      . $takeaway_html . '</blockquote>'
      . '</div>'
      . '</div>'
      . $entry->content());
    return $entry;
  }
}
