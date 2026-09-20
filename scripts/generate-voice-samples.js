/* eslint-disable no-restricted-syntax, no-continue, security/detect-non-literal-fs-filename -- Sequential one-time asset generation from a fixed catalog. */
/* One-time asset preparation. Never called by the preview API. Existing files
 * are skipped, so deployment and retries cannot regenerate finished samples. */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const fs = require('fs');
const path = require('path');
const { narrate, AUDIO_DIR } = require('../src/services/tts.service');
const { VOICES, SAMPLE_DIR, sampleFile } = require('../src/services/voices.service');

const scripts = {
  en: 'Hello, I am Liqrai, your reading companion. Let us explore this page together, one idea at a time.',
  am: 'ሰላም፣ እኔ ሊቅራይ ነኝ፣ የንባብ ጓደኛዎ። ይህን ገጽ በአንድነት እናንብብ፣ እያንዳንዱን ሀሳብ በተራ እንመልከት።',
  ar: 'مرحباً، أنا ليقراي، رفيقك في القراءة. دعنا نستكشف هذه الصفحة معاً، فكرة واحدة في كل مرة.',
};

async function main() {
  await fs.promises.mkdir(SAMPLE_DIR, { recursive: true });
  for (const voice of VOICES) {
    for (const lang of voice.supportedLanguages) {
      const target = path.join(SAMPLE_DIR, sampleFile(voice.id, lang));
      // All paths are derived from the fixed catalog, never request data.
      /* eslint-disable security/detect-non-literal-fs-filename */
      if (fs.existsSync(target)) continue;
      // eslint-disable-next-line no-await-in-loop, security/detect-object-injection
      await new Promise((resolve) => setTimeout(resolve, 22000));
      // eslint-disable-next-line no-await-in-loop, security/detect-object-injection
      const url = await narrate(scripts[lang], undefined, voice.id);
      if (!url) throw new Error(`Could not generate ${voice.id}/${lang}; completed recordings were retained.`);
      const source = path.join(AUDIO_DIR, path.basename(new URL(url).pathname));
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.copyFile(source, target);
      /* eslint-enable security/detect-non-literal-fs-filename */
      process.stdout.write(`Saved ${voice.id}/${lang}\n`);
    }
  }
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
