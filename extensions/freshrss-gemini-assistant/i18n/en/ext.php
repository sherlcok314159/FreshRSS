<?php

return array(
  'geminiAssistant' => array(
    'configure' => array(
      'gemini_api_key' => 'Gemini API Key',
      'gemini_api_key_help' => 'Get an API key from Google AI Studio (https://aistudio.google.com/apikey).',
      'gemini_model' => 'Model',
      'gemini_model_help' => 'e.g. gemini-3-flash-preview, gemini-2.5-flash, gemini-2.5-pro.',
      'gemini_thinking_level' => 'Thinking Level',
      'gemini_summary_prompt' => 'Summary Prompt Template',
      'gemini_summary_prompt_help' => 'Placeholders: {title}, {content}. Leave empty to use default.',
      'gemini_custom_css' => 'Custom CSS',
      'gemini_custom_css_help' => 'Applied to the result blockquote.',
    ),
    'ui' => array(
      'summarize_button' => 'Summarize',
      'loading' => 'Calling Gemini...',
      'error' => 'Error calling Gemini.',
      'no_key_configured' => 'No Gemini API key configured.',
    ),
  ),
);
