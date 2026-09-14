# LinB Kanban

Organize Markdown, images and files in **columns** or a **masonry wall**, using your current Obsidian theme.

The interface is in Chinese. It follows the pane width on desktop, tablet and phone, including split panes. Boards are local files; no account, subscription or external service is required.

## Features

- Switch between columns and a wall using the same cards.
- Write Markdown and view it with Obsidian's native renderer after saving.
- Choose a card color in the editor: default, gray, purple, blue, green, orange or pink. Subtle tints follow your theme in light and dark mode.
- Add images and other files through the file picker, paste or drag and drop. Images appear on cards; file attachments open in Obsidian.
- Use **从库中选图** to search existing vault images by filename or folder, with thumbnails. Selected images are referenced in place; they are not copied again. Repeated selection will not duplicate the same attachment within a card.
- Drag the six-dot handle with a mouse, pen or touch to reorder cards or move them between columns, including empty columns. An insertion line shows the destination. Holding near an edge scrolls the board; Escape cancels. The card menu also provides movement actions.
- Select lines in the card content editor, right-click and choose **转为待办复选框** to convert them to Markdown tasks. Check or uncheck rendered tasks on the card to save their state.
- Add, rename or remove columns, undo card deletion, and export a board as Markdown.
- Click the native stacked-pages-plus ribbon icon to create a board.

The wall adapts from multiple columns to one column in narrow panes. Columns scroll horizontally, and touch controls have larger targets. Touch behavior is covered by simulated interaction tests; physical iOS and Android devices have not yet been verified.

## Install

The plugin is being prepared for submission to the Obsidian Community directory. It is not yet listed there.

Download the installation ZIP from the [GitHub release](https://github.com/titaniumon23/linb-kanban/releases/latest), unzip it, and put its `linb-kanban` folder in your vault's `.obsidian/plugins/` folder, then enable **LinB Kanban** in Settings → Community plugins. Obsidian 1.8.7 or newer is required.

**Upgrading from 0.2.x:** disable the previous plugin installation first, then install and enable `linb-kanban`. Version 0.3.1 recognizes historical boards directly: they remain visible in the file explorer and in **LinB Kanban: 打开看板**. Opening a historical board does not rewrite it; explicit edits preserve its original format. To create a separate Markdown copy, export it or use **LinB Kanban: 导入旧版看板**. The original file and attachment references remain intact.

**Upgrading from 0.3.0:** replace only `main.js`, `manifest.json` and `styles.css` in `.obsidian/plugins/linb-kanban/`, then reload the plugin. This fixes old boards being hidden when Obsidian's “show unsupported files” option is off. Do not delete board or attachment folders while updating.

## Use

Version 0.3.4 fixes ordinary notes opening as a blank pane from a board tab. Plain Markdown stays in the native editor, and recovery from stale board view states runs after the host finishes loading.

Version 0.3.3 restores board views after delayed tab loading, tab activation, layout changes and sync updates. These checks only select the view and do not rewrite the note.

Click the stacked-pages-plus ribbon icon, or run **LinB Kanban: 新建看板** from the command palette. Enter a name and select **创建**.

- **栏**: arrange cards in named columns. Click a column name to edit it.
- **墙**: arrange the same cards in a responsive masonry wall.
- **添加卡片**: enter a title, Markdown content and optional attachments.
- Click a card title to edit it. Markdown is rendered after saving, not as live preview while typing.
- Drag the card handle, or use the card menu to move it.
- Use **LinB Kanban: 打开看板** to open an existing board. The board's **更多操作** menu also provides switching, creation and Markdown export.

Attachments are limited to 25 MB each and 20 per import. An uploaded `.md` file is a file attachment; it is not automatically expanded into a card's content.

## Data and privacy

Boards are real Markdown `.md` files, stored by default in `LinB Kanban/`. Both new boards and Markdown exports include a small frontmatter marker plus hidden structure information. With LinB Kanban 0.3.0 or newer enabled, marked files automatically open in their saved columns or wall layout, retaining card colors, order, text, task states and attachment references. Ordinary Markdown notes are unaffected. Without the plugin, the headings, text, tasks and attachment links remain readable as Markdown.

Card body text has one authoritative copy in the Markdown document. You can edit it between its body markers in a text editor, including checking Markdown tasks. Change titles, columns, card order, colors and attachment structure through the board interface. Keep the markers and hidden information intact. Unsupported edits outside the body blocks or damaged metadata produce an error instead of silently overwriting the source.

**Sharing:** the `.md` includes attachment references, not the image or file bytes. Copy the board and referenced attachments to the recipient's vault using the same vault-relative folder structure (including the board's folder for plain Markdown links). Newly uploaded attachments are in `LinB Kanban/附件/`; reused images remain at their original paths. A text-only board needs only its `.md` file. Merely pasting the visible text loses board metadata; share the actual file.

Back up or sync the board files and attachments together. The plugin does not provide its own sync service. Keep referenced attachment paths stable; external file renames are not yet reconciled with the hidden attachment metadata.

There is no telemetry, advertising, payment requirement or background network service. Files outside the vault are read only when you explicitly select, paste or drop them as attachments. Opening external links, or rendering Markdown containing remote images or embeds, can contact the services specified by that content through Obsidian or your browser.

Removing a card or attachment reference, cancelling an edit, or uninstalling the plugin does not delete attachment files. Real-time collaboration is not included.

## 中文说明

LinB Kanban 沿用 Obsidian 的主题颜色和字体，主要提供「栏」和「墙」两种视图。卡片可以写 Markdown、添加图片和其他文件。在编辑框的「卡片颜色」中选择默认、石墨灰、淡紫、雾蓝、柔绿、浅橙或淡粉，保存后生效。颜色使用当前主题的色值与背景混合，随深浅主题调整。

「图片与附件」里可点 **从库中选图**，按文件名或文件夹搜索已在 Obsidian 笔记库中的图片，查看缩略图后选择。已有图片直接引用原路径，不重复复制；从卡片移除不会删除原图。此入口仅在 Obsidian 中启用，网页预览不能读取真实笔记库。

侧栏的叠页加号图标直接新建看板。打开已有看板时，在命令面板选择 **LinB Kanban: 打开看板**。点卡片标题编辑，保存后显示 Markdown 排版。按住六点手柄可以上下排序、跨栏移动，出现插入线后松开；拖到边缘会自动滚动。也可通过卡片菜单移动。

在卡片编辑框里选中文字，右键选择 **转为待办复选框**。选中多行会逐行转换为 `- [ ]`，保存后可直接勾选，勾选状态写回卡片。

电脑、平板、手机和窄分屏根据实际面板宽度适配；手机的墙为单列，栏可以横向滑动。触屏交互已做模拟测试，尚未在实体手机和平板上验证。

**0.3.1 修复：**旧格式看板可以直接在文件列表和「打开看板」中找到，不再要求先转换。打开不会改写原文件；编辑仍保存为原格式。需要 Markdown 副本时，可导出或运行 **LinB Kanban: 导入旧版看板**。从 0.3.0 更新，只替换安装目录中的三个插件文件，再重新加载插件；不要删除看板和附件目录。

**分享看板：**现在新建和导出都使用 `.md`。对方安装并启用 LinB Kanban 0.3.0 或更新版本，打开文件就会显示保存的栏或墙；没有插件也能阅读 Markdown。请发送完整文件，不要只复制可见文字。纯文字看板发 `.md` 即可；有图片或文件时，需要把所引用的附件一起发送，保持它们及看板相对笔记库根目录的文件夹结构。

正文可在源码中的卡片正文标记之间修改；标题、栏、颜色、附件等请在看板界面修改。请保留文件中的看板标记和隐藏信息，避免无法恢复布局。

## Development

Requires Node.js 22 or later. Python 3 is only needed for the optional ZIP packaging command.

```sh
npm ci
npm run check
npm test
npm run build
```

The installable files are built into `dist/linb-kanban/`. Run `npm run preview` to open the shared UI locally at `http://127.0.0.1:4178`. The preview includes light/dark and pane-width controls; its Markdown renderer is simplified. The installed plugin uses Obsidian's native Markdown renderer.

The automated suite covers data compatibility, atomic saves, card interactions, attachments and the compiled plugin entry with a simulated Obsidian host. It does not replace real-device testing.

## License

[MIT](LICENSE). Uses Obsidian's public plugin API and built-in Lucide icons. No code from another Obsidian plugin is bundled.
