const exclude = require('../../../src/utils/exclude');

describe('exclude util', () => {
  test('should remove the given keys from the object', () => {
    const user = { id: '1', name: 'Bob', password: 'secret' };
    expect(exclude(user, ['password'])).toEqual({ id: '1', name: 'Bob' });
  });

  test('should not mutate the original object', () => {
    const user = { id: '1', password: 'secret' };
    exclude(user, ['password']);
    expect(user).toHaveProperty('password', 'secret');
  });

  test('should return an equivalent object if no keys are given', () => {
    const user = { id: '1', name: 'Bob' };
    expect(exclude(user, [])).toEqual(user);
  });
});
