import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPreviewUrl, LinkPreviewService, parsePreview, previewUrl, videoUrl } from '../src/link-preview';

test('metadata extracts an image, decoded text and a video badge without embedding remote HTML', () => {
  const data = parsePreview('https://example.com/post', '<meta content="A &amp; B" property="og:title"><meta name="description" content="Some text"><meta property="og:image" content="/cover.jpg"><meta property="og:type" content="video.other"><script>bad()</script>');
  assert.equal(data.title, 'A & B'); assert.equal(data.image, 'https://example.com/cover.jpg'); assert.equal(data.video, true);
  assert.equal(parsePreview('https://example.com/', '<title>Plain</title>').image, '');
  assert.equal(parsePreview('https://example.com/', '<meta property="og:image" content="javascript:bad()">').image, '');
  assert.equal(parsePreview('https://example.com/', '<meta property="og:image" content="http://127.0.0.1/a">').image, '');
});

test('video classification does not mark every social post or deceptive host as video', () => {
  for (const url of ['https://www.bilibili.com/video/BV123', 'https://youtu.be/abc', 'https://www.youtube.com/watch?v=abc', 'https://vimeo.com/123', 'https://media.example.com/file.mp4']) assert.equal(videoUrl(url), true, url);
  for (const url of ['https://www.xiaohongshu.com/explore/abc', 'https://youtube.com.evil.example/watch?v=x', 'https://www.bilibili.com/read/cv123']) assert.equal(videoUrl(url), false, url);
});

test('card previews use the explicit URL or first prose link while ignoring Markdown images/code', () => {
  assert.equal(cardPreviewUrl('https://example.com/chosen', 'https://example.com/other'), 'https://example.com/chosen');
  assert.equal(cardPreviewUrl('', '![cover](https://example.com/image.png)\n`https://example.com/code`\n[视频](https://example.com/video)'), 'https://example.com/video');
  assert.equal(previewUrl('file:///etc/passwd'), ''); assert.equal(previewUrl('http://localhost/private'), ''); assert.equal(previewUrl('https://user:pass@example.com'), '');
});

test('preview requests are deduplicated, skip binary downloads, and fail without affecting a card', async () => {
  let calls = 0;
  const service = new LinkPreviewService(async () => { calls++; return { text: '<title>Example</title>', status: 200, headers: { 'Content-Type': 'text/html' } }; });
  const [one, two] = await Promise.all([service.get('https://example.com/page'), service.get('https://example.com/page')]);
  assert.equal(calls, 1); assert.equal(one.title, 'Example'); assert.deepEqual(one, two);
  assert.equal((await service.get('https://example.com/video.mp4')).video, true); assert.equal(calls, 1);
  const offline = new LinkPreviewService(async () => { throw new Error('Offline'); });
  assert.equal((await offline.get('https://example.com/page')).title, 'example.com');
});

test('only three link metadata requests run concurrently', async () => {
  const releases: (() => void)[] = []; let active = 0; let peak = 0;
  const service = new LinkPreviewService(async () => {
    active++; peak = Math.max(peak, active); await new Promise<void>(resolve => releases.push(resolve)); active--;
    return { status: 200, headers: { 'content-type': 'text/html' }, text: '<title>Page</title>' };
  });
  const all = Promise.all(Array.from({ length: 5 }, (_, i) => service.get(`https://example.com/${i}`)));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 3);
  for (const release of releases.splice(0)) release();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 2);
  for (const release of releases) release(); await all; assert.equal(peak, 3);
});
