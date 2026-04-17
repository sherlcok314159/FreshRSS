<?php

return [
	'panguformat' => [
		'description' => '在文章入库时自动在中英文之间添加空格。格式化结果永久保存，不会影响高亮等扩展的正常工作。',
		'migrate_title' => '格式化已有文章',
		'migrate_help' => '对数据库中所有已有文章执行一次盘古格式化。只需执行一次，之后新文章会在导入时自动格式化。',
		'migrate_button' => '立即格式化所有已有文章',
		'migrate_done' => '已格式化 %d 篇文章，执行时间 %s。',
	],
];
