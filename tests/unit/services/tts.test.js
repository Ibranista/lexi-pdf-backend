const { speakable } = require('../../../src/services/tts.service');

describe('narration text', () => {
  describe('document names', () => {
    test('should not read out a name that is serials and separators', () => {
      expect(speakable('In 2024_scan_0093.pdf the author argues that light was time.')).toBe(
        'In this document the author argues that light was time.'
      );
    });

    test('should not read out a hashed name', () => {
      expect(speakable('See 9f8a7b6c5d4e3f2a1b0c.pdf for the tables.')).toBe('See this document for the tables.');
    });

    test('should not read out a camera-style name that never had an extension', () => {
      expect(speakable('IMG_20240513_120233 is the file you opened.')).toBe('this document is the file you opened.');
    });

    test('should still say a name made of real words', () => {
      expect(speakable('The_Great_Gatsby.pdf opens on a lawn.')).toBe('The Great Gatsby opens on a lawn.');
    });

    test('should keep the words and drop the version tags around them', () => {
      expect(speakable('Physics_Notes_2024_final_v3(1).pdf covers gradient descent.')).toBe(
        'Physics Notes final covers gradient descent.'
      );
    });

    test('should drop a trailing extension without swallowing the sentence stop', () => {
      expect(speakable('It is on page 12 of report.pdf.')).toBe('It is on page 12 of report.');
    });

    test('should leave a bracket around the name where it was', () => {
      expect(speakable('(see 2024_scan_0093.pdf) for the tables')).toBe('(see this document) for the tables');
    });
  });

  describe('ordinary prose', () => {
    test('should leave letter-and-digit terms alone', () => {
      const text = 'COVID-19 and GPT-4 and H2O should survive untouched.';
      expect(speakable(text)).toBe(text);
    });

    test('should leave page and chapter numbers alone', () => {
      const text = 'Backpropagation, chapter 4 of Deep Learning, is on page 42.';
      expect(speakable(text)).toBe(text);
    });
  });
});
