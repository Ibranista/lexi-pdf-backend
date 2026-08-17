const ttsService = require('../../../src/services/tts.service');
const { createSpeechChunker } = require('../../../src/services/ai.service');

/**
 * The chunker cuts a reply into clips as it is generated, so a live voice turn
 * can start speaking on sentence one. What matters here is *where* it cuts:
 * too eager and the reader hears "e." on its own, too patient and they sit in
 * silence waiting for the whole answer to be written.
 */

/** Feed a reply through the chunker the way the model does — a token at a time. */
const speak = async (reply, { tokenSize = 7 } = {}) => {
  const clips = [];
  const chunker = createSpeechChunker({ onReady: (clip) => clips.push(clip) });
  for (let i = 0; i < reply.length; i += tokenSize) {
    chunker.push(reply.slice(i, i + tokenSize));
  }
  await chunker.end();
  return clips;
};

const texts = (clips) => clips.map((clip) => clip.text);

beforeEach(() => {
  // Every clip renders, instantly and in order — this is about the cutting,
  // not about the voice.
  jest.spyOn(ttsService, 'narrate').mockImplementation(async (text) => `https://x/${encodeURIComponent(text)}.mp3`);
});

describe('cutting a reply into clips', () => {
  test('should send the opening sentence before the reply is finished', async () => {
    const clips = await speak(
      'It turns night into usable time. The lamps mattered less for the light than for the hours they gave back, ' +
        'and the author keeps returning to that trade. What did you make of the gas men?'
    );

    // The first clip is the opening sentence alone: the reader hears it while
    // the rest is still being written.
    expect(texts(clips)[0]).toBe('It turns night into usable time.');
    expect(clips[0].seq).toBe(0);
    expect(clips.map((clip) => clip.seq)).toEqual([0, 1]);
    expect(texts(clips).join(' ')).toContain('What did you make of the gas men?');
  });

  test('should not cut a clip out of an abbreviation', async () => {
    const clips = await speak('The author leans on other trades, e.g. the lamplighters, to make the point stick.');

    expect(texts(clips)).toEqual(['The author leans on other trades, e.g. the lamplighters, to make the point stick.']);
  });

  test('should not cut inside a decimal', async () => {
    const clips = await speak('Output rose to 3.5 times what the gas jets managed.');

    expect(texts(clips)).toEqual(['Output rose to 3.5 times what the gas jets managed.']);
  });

  test('should keep a closing quote with the sentence it ends', async () => {
    const clips = await speak(
      'He calls it "reclaimed time." That phrase is doing a lot of work in this chapter, and it is worth sitting with.'
    );

    expect(texts(clips)[0]).toBe('He calls it "reclaimed time."');
  });

  test('should speak an Amharic sentence stop', async () => {
    const clips = await speak('ይህ ገጽ ስለ ብርሃን ነው። ደራሲው ጊዜን እንደ ሸቀጥ ያቀርባል፣ እና ያ ነጥብ በምዕራፉ ውስጥ ተደጋግሞ ይመጣል።');

    expect(texts(clips)[0]).toBe('ይህ ገጽ ስለ ብርሃን ነው።');
  });

  test('should cut a runaway sentence at a pause rather than let one clip grow forever', async () => {
    const clips = await speak(`The argument runs on${', and on'.repeat(60)} without ever stopping`);

    expect(clips.length).toBeGreaterThan(1);
    // Nothing enormous went to the voice, and nothing was dropped on the way.
    clips.forEach((clip) => expect(clip.text.length).toBeLessThanOrEqual(400));
    // Clips are trimmed, so the whitespace a cut landed on is the join.
    expect(texts(clips).join(' ')).toBe(`The argument runs on${', and on'.repeat(60)} without ever stopping`);
  });

  test('should speak a reply with no sentence end at all', async () => {
    const clips = await speak('no punctuation here at all');

    expect(texts(clips)).toEqual(['no punctuation here at all']);
  });

  test('should say nothing for an empty reply', async () => {
    expect(await speak('   ')).toEqual([]);
  });

  test('should not announce a clip the voice failed to render', async () => {
    ttsService.narrate.mockResolvedValue(undefined);

    expect(await speak('It turns night into usable time. That is the whole argument of the chapter, really.')).toEqual([]);
  });

  test('should keep the reply whole across the clips it was cut into', async () => {
    const reply =
      'It turns night into usable time. The lamps mattered less for the light than for the hours they gave back. ' +
      'What did you make of the gas men? They lost a trade to it.';

    expect(texts(await speak(reply)).join(' ')).toBe(reply);
  });

  test('should not wait for a clip that renders slowly before announcing a later one', async () => {
    // A repeated sentence is a filesystem cache hit and comes back instantly; a
    // fresh one does not. Clips therefore arrive out of order, which is exactly
    // what `seq` is for — so assert the ordering is carried, not the arrival.
    ttsService.narrate.mockImplementation(async (text) => {
      if (text.startsWith('It turns')) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return `https://x/${encodeURIComponent(text)}.mp3`;
    });

    const clips = await speak(
      'It turns night into usable time. The lamps mattered less for the light than for the hours they gave back.'
    );

    expect(clips[0].text).toBe('The lamps mattered less for the light than for the hours they gave back.');
    expect(clips[0].seq).toBe(1);
    expect(clips[1].seq).toBe(0);
  });
});
