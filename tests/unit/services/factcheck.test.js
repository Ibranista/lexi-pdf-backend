const { usable, MIN_CONFIDENCE, MAX_CLAIMS } = require('../../../src/services/factcheck.service');

/**
 * The prompt asks the model to behave; this is what happens when it doesn't.
 *
 * Every rule here exists because breaking it puts a red mark on a reader's page
 * that either points at nothing or points at the wrong sentence — and a mark
 * carries the authority of a check, so being wrong is worse than being absent.
 */

const PAGE = [
  'Edison did not invent the light bulb so much as make one worth owning.',
  'His Pearl Street station opened in 1882 and lit a square mile of Manhattan.',
  'The gas industry, which had lit the city for fifty years, was finished inside a decade.',
].join('\n');

const claim = (over) => ({
  quote: 'His Pearl Street station opened in 1882 and lit a square mile of Manhattan.',
  kind: 'inaccurate',
  note: 'It lit roughly a quarter of a square mile.',
  confidence: 0.9,
  ...over,
});

describe('what reaches the page', () => {
  test('should keep a claim that quotes the page exactly', () => {
    expect(usable([claim()], PAGE)).toHaveLength(1);
  });

  test('should drop a quote that is nowhere on the page', () => {
    // The model paraphrasing instead of quoting is the common failure, and it
    // leaves a mark with nothing under it.
    expect(usable([claim({ quote: 'Pearl Street lit the whole of Manhattan.' })], PAGE)).toEqual([]);
  });

  test('should keep a quote that wraps across a line break', () => {
    // Extraction wraps lines; the model sees the text reflowed. Matching on raw
    // characters would throw away perfectly good claims.
    const wrapped = claim({
      quote: 'The gas industry, which had lit the city for fifty years,\n  was finished inside a decade.',
    });
    expect(usable([wrapped], PAGE)).toHaveLength(1);
  });

  test('should drop a claim the model was not confident about', () => {
    expect(usable([claim({ confidence: MIN_CONFIDENCE - 0.01 })], PAGE)).toEqual([]);
    expect(usable([claim({ confidence: MIN_CONFIDENCE })], PAGE)).toHaveLength(1);
  });

  test('should drop a claim with no confidence at all', () => {
    expect(usable([claim({ confidence: undefined })], PAGE)).toEqual([]);
  });

  test('should drop a kind that is not one of ours', () => {
    expect(usable([claim({ kind: 'wrong' })], PAGE)).toEqual([]);
  });

  test('should drop a quote too short to mark', () => {
    // "1882" appears on the page, but underlining four characters points at
    // nothing a reader can read as a sentence.
    expect(usable([claim({ quote: '1882' })], PAGE)).toEqual([]);
  });

  test('should drop a claim missing its explanation', () => {
    expect(usable([claim({ note: undefined })], PAGE)).toEqual([]);
  });

  test('should survive junk without throwing', () => {
    expect(usable([null, undefined, {}, 'nonsense'], PAGE)).toEqual([]);
    expect(usable(null, PAGE)).toEqual([]);
  });

  test('should cap how much one page can be marked up', () => {
    const many = Array.from({ length: MAX_CLAIMS + 3 }, () => claim());
    expect(usable(many, PAGE)).toHaveLength(MAX_CLAIMS);
  });

  test('should trim a quote without losing the match', () => {
    expect(usable([claim({ quote: `  ${claim().quote}  ` })], PAGE)).toHaveLength(1);
  });
});
