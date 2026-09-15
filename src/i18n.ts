let language: 'zh' | 'en' = 'zh';
export function setLanguage(locale: string): void { language = /^zh(?:-|$)/i.test(locale) ? 'zh' : 'en'; }
export function getUiLanguage(): 'zh' | 'en' { return language; }
const english: Record<string, string> = Object.fromEntries(`
未命名看板|Untitled board
看板文件已移动或删除，请重新打开。|The board was moved or deleted. Open it again.
旧版文件显示兼容未能启用，仍可通过“LinB Kanban: 打开看板”访问旧看板。|Legacy file registration failed. Use LinB Kanban: Open board to access older boards.
新建看板|New board
打开看板|Open board
创建示例看板|Create example board
导入旧版看板|Import legacy board
用看板打开|Open as board
“{0}”是文件，无法在此保存附件。|“{0}” is a file. Attachments cannot be saved here.
请先把旧版看板文件放入当前笔记库，再运行此命令。|Add the legacy board file to this vault, then run this command again.
已创建 Markdown 看板，旧文件和附件保持不变。|Markdown board created. The original file and attachments are unchanged.
看板|Board
正在打开普通笔记…|Opening note…
看板暂时无法读取|Unable to read board
{0} 原文件未被修改。|{0} The original file is unchanged.
重新读取|Read again
已切换看板，请重新打开后再保存。|The board changed. Reopen it before saving.
附件已移动或不存在。|The attachment was moved or is missing.
{0}{1} - 导出|{0}{1} - Export
已导出为 Markdown，原看板保持不变。|Exported as Markdown. The original board is unchanged.
笔记库中还没有图片，可以先添加附件。|No images in this vault yet. Add an attachment first.
这张图片已被删除，请重新选择。|This image was deleted. Choose another image.
请先打开看板。|Open a board first.
一次最多添加 20 个附件，请分批添加。|Add up to 20 attachments at a time.
“{0}”超过 25 MB，请压缩后再添加。|“{0}” exceeds 25 MB. Reduce its size and try again.
“{0}”是空文件。|“{0}” is empty.
粘贴的图片.png|Pasted image.png
搜索看板…|Search boards…
搜索库内图片（文件名或路径）|Search vault images by name or path
我的看板|My board
名称|Name
看板名称|Board name
创建|Create
给这面看板起一个名字。|Give this board a name.
默认|Default
石墨灰|Gray
淡紫|Purple
雾蓝|Blue
柔绿|Green
浅橙|Orange
淡粉|Pink
已保存|Saved
重命名|Rename
布局方式|Layout
墙|Wall
栏|Columns
更多操作|More actions
添加卡片|Add card
卡片|Card
正在保存…|Saving…
保存失败|Save failed
暂时没有保存成功，请重试。|Unable to save. Try again.
Markdown 已导出|Markdown exported
还没有卡片|No cards yet
添加卡片，或拖入图片和文件。|Add a card, or drop images and files here.
编辑栏：{0}|Edit column: {0}
向{0}添加卡片|Add card to {0}
添加栏|Add column
打开图片：{0}|Open image: {0}
图片暂时无法显示|Image unavailable
未命名卡片|Untitled card
卡片操作：{0}|Card actions: {0}
移动卡片：{0}|Move card: {0}
拖动排序，或点按选择移动位置|Drag to reorder, or tap to choose a position
打开链接：{0}|Open link: {0}
视频|Video
切换待办 {0}|Toggle task {0}
切换看板|Switch board
导出为 Markdown|Export as Markdown
编辑卡片|Edit card
向前移动|Move earlier
向后移动|Move later
移动到栏|Move to column
删除卡片|Delete card
卡片已删除|Card deleted
撤销|Undo
卡片已恢复|Card restored
关闭编辑面板|Close editor
还有未保存的修改|You have unsaved changes
继续编辑|Keep editing
放弃修改|Discard changes
正在保存或导入附件，请稍候|Saving or importing attachments. Please wait.
标题（可选）|Title (optional)
写点内容…|Write something…
转为待办复选框|Convert to tasks
内容格式|Text formatting
待办|Task
列表|List
编号|Numbered
加粗|Bold
插入链接|Link
内容|Content
标题|Title
卡片颜色|Card color
所属分栏|Column
链接（可选）|Link (optional)
选择图片或附件|Choose images or attachments
添加附件|Add attachment
从库中选图|Vault images
请在 Obsidian 中使用，网页预览无法读取笔记库|Available in Obsidian. The web preview cannot read your vault.
上传新文件，或直接引用库内图片|Upload files or reuse vault images
支持拖入或粘贴；从库中选图需在 Obsidian 中使用|Drop or paste files. Vault images are available in Obsidian.
图片与附件|Images and attachments
移除附件：{0}|Remove attachment: {0}
取消|Cancel
保存修改|Save changes
正在选择…|Choosing…
正在导入…|Importing…
请写入内容或添加附件。|Write some content or add an attachment.
链接请以 https:// 或 http:// 开头。|Start the link with https:// or http://.
这个分栏已经不存在，请选择其他分栏后保存。|This column no longer exists. Choose another before saving.
卡片已更新|Card updated
卡片已添加|Card added
{0} 你的内容仍保留在这里，可以复制后重试。|{0} Your draft is still here. Copy it or try again.
说明（可选）|Description (optional)
保存|Save
请填写看板名称。|Enter a board name.
编辑栏|Edit column
栏名称|Column name
删除栏时，将卡片移动到：|Move cards to this column before deleting:
删除此栏|Delete column
栏已删除，卡片已转移|Column deleted; cards moved
保存栏|Save column
请填写栏名称。|Enter a column name.
栏已更新|Column updated
栏已添加|Column added
关闭提示|Dismiss
请先保存或关闭当前面板，再添加附件|Save or close this editor before adding attachments
松开，添加图片或文件|Drop to add images or files
文字|Text
链接文字|Link text
{0}格式不正确。|Invalid {0} format.
{0}必须是{1}文本，且不超过 {2} 个字符。|{0} must be {1}text with at most {2} characters.
非空|non-empty 
{0}只能包含字母、数字、下划线和连字符。|{0} may only contain letters, numbers, underscores and hyphens.
{0}不是有效的 ISO 时间。|{0} is not a valid ISO timestamp.
附件|Attachment
附件路径|Attachment path
附件必须使用仓库内的相对路径。|Attachments must use vault-relative paths.
附件路径不能包含空目录或上级目录。|Attachment paths cannot contain empty or parent directories.
附件路径含有不安全的转义字符。|The attachment path contains unsafe escapes.
附件名称|Attachment name
附件类型|Attachment type
卡片 ID|Card ID
卡片分栏 ID|Card column ID
卡片标题|Card title
卡片正文|Card body
卡片颜色不受支持。|Unsupported card color.
卡片附件列表不正确或超过 100 个。|Invalid attachment list or more than 100 attachments.
卡片链接|Card link
卡片链接仅支持完整的 http:// 或 https:// 地址。|Card links must be complete http:// or https:// URLs.
创建时间|Created time
修改时间|Modified time
卡片修改时间不能早于创建时间。|A card cannot be modified before its creation time.
不支持此看板版本（{0}）。请保留原文件并更新插件。|Unsupported board version ({0}). Keep the original file and update the plugin.
看板修订号无效。|Invalid board revision.
看板 ID|Board ID
看板标题|Board title
看板描述|Board description
看板布局不受支持。|Unsupported board layout.
看板背景不受支持。|Unsupported board background.
看板需要 1 至 1000 个分栏。|A board needs between 1 and 1000 columns.
分栏|Column
分栏 ID|Column ID
分栏标题|Column title
分栏颜色不受支持。|Unsupported column color.
看板含有重复的分栏 ID。|Duplicate column IDs in this board.
看板卡片列表不正确或超过 20000 张。|Invalid card list or more than 20000 cards.
看板含有重复的卡片 ID。|Duplicate card IDs in this board.
卡片指向不存在的分栏。请保留原文件。|A card refers to a missing column. Keep the original file.
第1栏|Column 1
第2栏|Column 2
第3栏|Column 3
无法读取旧版看板：文件不是有效 JSON。原文件未被修改。|Cannot read the legacy board: invalid JSON. The original file is unchanged.
这不是 LinB Kanban 看板，或文件格式版本不受支持。原文件未被修改。|Not a supported LinB Kanban board. The original file is unchanged.
看板信息缺失，请保留文件末尾的 LinB Kanban 信息。|Missing board data. Keep the LinB Kanban metadata at the end of the file.
看板信息|Board data
看板信息损坏。原文件未被修改。|Board data is damaged. The original file is unchanged.
此 Markdown 看板版本不受支持，请更新插件。|Unsupported Markdown board version. Update the plugin.
看板文件夹|Board folder
卡片列表不正确。|Invalid card list.
卡片正文标记重复，请保留原文件。|Duplicate card body markers. Keep the original file.
卡片正文标记缺失或重复，请保留原文件。|Missing or duplicate card body markers. Keep the original file.
卡片正文标记缺失，请保留原文件。|Missing card body markers. Keep the original file.
看板标题、分栏或附件结构在源码中有改动。请保留原文件，在看板界面修改这些内容；正文可在卡片正文标记之间编辑。|Board structure was edited in source. Keep the original file and edit titles, columns and attachments in the board UI. Body text can be edited between its markers.
修改内容|Changes
修改内容含有不支持的字段。|Changes contain unsupported fields.
卡片已不存在，请刷新后重试。|This card no longer exists. Refresh and try again.
这张卡片已在其他窗口修改。请重新打开卡片后再保存，避免覆盖新内容。|This card changed in another window. Reopen it before saving to preserve the newer content.
目标卡片已不存在，请刷新后重试。|The target card no longer exists. Refresh and try again.
卡片 ID 已存在。|This card ID already exists.
卡片不能以自身作为其他分栏的目标。|A card cannot target itself in another column.
分栏已不存在。|This column no longer exists.
删除分栏前，请指定另一个分栏接收卡片。|Choose another column for these cards before deleting this column.
不支持的看板操作。|Unsupported board operation.
导出文件夹|Export folder
看板描述不能包含 LinB Kanban 内部标记。|Remove internal LinB Kanban markers from the description.
正文不能包含 LinB Kanban 内部标记，请移除该标记后保存。|Remove internal LinB Kanban markers from the body before saving.
示例看板|Example board
文字卡片|Text card
重命名栏|Rename columns
图片与文件|Images and files
移动卡片|Move cards
墙视图|Wall layout
触屏操作|Touch controls
`.trim().split('\n').map(line => { const index = line.indexOf('|'); return [line.slice(0, index), line.slice(index + 1)]; }));
Object.assign(english, {
  '可以写文字、列表和 Markdown。\n\n示例：**需要强调的内容**。': 'Write text, lists and Markdown.\n\nExample: **emphasized text**.',
  '点击栏标题，输入自己的分类名称。\n\n示例卡片，可编辑或删除。': 'Click a column title to rename it.\n\nExample card; edit or delete it.',
  '添加卡片时选择附件，或把文件直接拖进这一栏。\n\n示例卡片，可编辑或删除。': 'Choose attachments when adding a card, or drop files into a column.\n\nExample card; edit or delete it.',
  '使用拖动手柄调整顺序，也可从卡片菜单选择移动。\n\n示例卡片，可编辑或删除。': 'Use the drag handle or card menu to move cards.\n\nExample card; edit or delete it.',
  '顶部切换到“墙”，同一批卡片会自动排列。\n\n示例卡片，可编辑或删除。': 'Switch to Wall at the top to arrange the same cards automatically.\n\nExample card; edit or delete it.',
  '小屏下横向滑动查看其他栏，点卡片标题可编辑。\n\n示例卡片，可编辑或删除。': 'Swipe horizontally to see other columns. Tap a card title to edit.\n\nExample card; edit or delete it.',
});
export function t(source: string, ...values: unknown[]): string {
  const text = language === 'en' ? english[source] ?? source : source;
  return text.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
