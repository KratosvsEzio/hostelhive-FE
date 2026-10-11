import { extractServerMessages } from './api-error-message';
import { errorStatus, isBareNotFound, serverText } from './api-error-text';

describe('errorStatus', () => {
  it.each([
    { err: { status: 404 }, status: 404 },
    { err: { status: 0 }, status: 0 },
    { err: { status: '404' }, status: null },
    { err: {}, status: null },
    { err: undefined, status: null },
    { err: null, status: null },
    { err: 'boom', status: null },
    { err: 42, status: null },
    { err: new Error('404'), status: null },
  ])('reads $status from $err', ({ err, status }) => {
    expect(errorStatus(err)).toBe(status);
  });
});

describe('serverText', () => {
  it('lower-cases, straightens apostrophes, collapses spaces and drops trailing periods', () => {
    const err = { status: 403, serverMessages: ['  This Account’s  link ʼhas‘ EXPIRED...  '] };
    expect(serverText(err)).toBe("this account's link 'has' expired");
  });

  it('joins several messages with a space', () => {
    expect(serverText({ serverMessages: ['Request refused:', 'link expired.'] })).toBe(
      'request refused: link expired',
    );
  });

  it('ignores messages that are not strings', () => {
    expect(serverText({ serverMessages: [42, null, 'Gone'] })).toBe('gone');
  });

  it('never reads the message', () => {
    expect(serverText({ status: 403, message: 'This link has expired' })).toBe('');
  });

  it.each([undefined, null, 'boom', 42, new Error('boom'), { serverMessages: 'not an array' }])(
    'returns an empty string for %j',
    (err) => {
      expect(serverText(err)).toBe('');
    },
  );
});

describe('isBareNotFound', () => {
  it('is true for the 404 body Rails sends, read as the interceptor reads it', () => {
    const serverMessages = extractServerMessages({ status: 404, error: 'Not Found' });
    expect(isBareNotFound(serverText({ status: 404, serverMessages }))).toBe(true);
  });

  it.each(['NOT FOUND.', ' not  found '])('is true for %j once normalised', (message) => {
    expect(isBareNotFound(serverText({ serverMessages: [message] }))).toBe(true);
  });

  it.each(['', 'token not found', 'this link is invalid'])('is false for %j', (text) => {
    expect(isBareNotFound(text)).toBe(false);
  });
});
