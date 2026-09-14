# LinB Kanban

Organize Markdown, images and files in **columns** or a **masonry wall**, using your current Obsidian theme.

The interface is in Chinese. It follows the pane width on desktop, tablet and phone, including split panes. Boards are local files; no account, subscription or external service is required.

## Features

- Switch between columns and a wall using the same cards.
- Write Markdown and view it with Obsidian's native renderer after saving.
- Add images and other files through the file picker, paste or drag and drop. Images appear on cards; file attachments open in Obsidian.
- Drag the six-dot handle with a mouse, pen or touch to reorder cards or move them between columns, including empty columns. An insertion line shows the destination. Holding near an edge scrolls the board; Escape cancels. The card menu also provides movement actions.
- Select lines in the card content editor, right-click and choose **转为待办复选框** to convert them to Markdown tasks. Check or uncheck rendered tasks on the card to save their state.
- Add, rename or remove columns, undo card deletion, and export a board as Markdown.
- Click the native stacked-pages-plus ribbon icon to create a board.

The wall adapts from multiple columns to one column in narrow panes. Columns scroll horizontally, and touch controls have larger targets. Touch behavior is covered by simulated interaction tests; physical iOS and Android devices have not yet been verified.

## Install

The plugin is being prepared for submission to the Obsidian Community directory. It is not yet listed there.

Until it is listed, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/titaniumon23/linb-kanban/releases/latest), put them in your vault's `.obsidian/plugins/moss-wall/` folder, then enable **LinB Kanban** in Settings → Community plugins. Obsidian 1.8.7 or newer is required.

For an existing Moss Wall installation, disable it, replace those three files in the same folder, then enable **LinB Kanban**. The stable plugin ID remains `moss-wall`, so this is an update to the same plugin. Existing boards do not need migration.

## Use

Click the stacked-pages-plus ribbon icon, or run **LinB Kanban: 新建看板** from the command palette. Enter a name and select **创建**.

- **栏**: arrange cards in named columns. Click a column name to edit it.
- **墙**: arrange the same cards in a responsive masonry wall.
- **添加卡片**: enter a title, Markdown content and optional attachments.
- Click a card title to edit it. Markdown is rendered after saving, not as live preview while typing.
- Drag the card handle, or use the card menu to move it.
- Use **LinB Kanban: 打开看板** to open an existing board. The board's **更多操作** menu also provides switching, creation and Markdown export.

Attachments are limited to 25 MB each and 20 per import. An uploaded `.md` file is a file attachment; it is not automatically expanded into a card's content.

## Data and privacy

Boards are `.moss` JSON files in the vault. The default storage folder remains `Moss Wall/` for compatibility with earlier versions. Attachments are copied to `Moss Wall/附件/`. Back up or sync both the board files and their attachments; the plugin does not provide its own sync service.

There is no telemetry, advertising, payment requirement or background network service. Files outside the vault are read only when you explicitly select, paste or drop them as attachments. Opening external links, or rendering Markdown containing remote images or embeds, can contact the services specified by that content through Obsidian or your browser.

Removing a card or attachment reference, cancelling an edit, or uninstalling the plugin does not delete attachment files. Links inside `.moss` files do not participate in Obsidian's native backlink index. Renaming a linked note or attachment may require manually updating its link. Real-time collaboration is not included.

## 中文说明

LinB Kanban 沿用 Obsidian 的主题颜色和字体，主要提供「栏」和「墙」两种视图。卡片可以写 Markdown、添加图片和其他文件。

侧栏的叠页加号图标直接新建看板。打开已有看板时，在命令面板选择 **LinB Kanban: 打开看板**。点卡片标题编辑，保存后显示 Markdown 排版。按住六点手柄可以上下排序、跨栏移动，出现插入线后松开；拖到边缘会自动滚动。也可通过卡片菜单移动。

在卡片编辑框里选中文字，右键选择 **转为待办复选框**。选中多行会逐行转换为 `- [ ]`，保存后可直接勾选，勾选状态写回卡片。

电脑、平板、手机和窄分屏根据实际面板宽度适配；手机的墙为单列，栏可以横向滑动。触屏交互已做模拟测试，尚未在实体手机和平板上验证。

旧版 Moss Wall 用户可以直接替换插件安装文件。内部 ID `moss-wall`、`.moss` 文件格式和 `Moss Wall/` 存储目录保持兼容，不需要搬动原有数据。

## Development

Requires Node.js 22 or later. Python 3 is only needed for the optional ZIP packaging command.

```sh
npm ci
npm run check
npm test
npm run build
```

The installable files are built into `dist/moss-wall/`. Run `npm run preview` to open the shared UI locally at `http://127.0.0.1:4178`. The preview includes light/dark and pane-width controls; its Markdown renderer is simplified. The installed plugin uses Obsidian's native Markdown renderer.

The automated suite covers data compatibility, atomic saves, card interactions, attachments and the compiled plugin entry with a simulated Obsidian host. It does not replace real-device testing.

## License

[MIT](LICENSE). Uses Obsidian's public plugin API and built-in Lucide icons. No code from another Obsidian plugin is bundled.
