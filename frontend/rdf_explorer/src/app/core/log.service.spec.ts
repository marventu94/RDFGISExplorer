import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogService, LogEntry } from './log.service';

describe('LogService', () => {
  let service: LogService;

  beforeEach(() => {
    service = new LogService();
  });

  it('starts with empty entries', () => {
    expect(service.entries()).toEqual([]);
  });

  it('add appends a log entry with date and info', () => {
    const before = Date.now();
    service.add('test message');
    const entries = service.entries();
    expect(entries.length).toBe(1);
    expect(entries[0].info).toBe('test message');
    expect(entries[0].date.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('add appends entries in order', () => {
    service.add('first');
    service.add('second');
    service.add('third');
    expect(service.entries().map(e => e.info)).toEqual(['first', 'second', 'third']);
  });

  it('entries are readonly from outside', () => {
    service.add('msg');
    const entries: readonly LogEntry[] = service.entries();
    expect(entries.length).toBe(1);
  });

  it('clear empties all entries', () => {
    service.add('a');
    service.add('b');
    service.clear();
    expect(service.entries()).toEqual([]);
  });

  it('clear can be called on empty log', () => {
    expect(() => service.clear()).not.toThrow();
  });

  describe('download', () => {
    it('creates an anchor and clicks it to download JSON', () => {
      const clickSpy = vi.fn();
      const appendChildSpy = vi.fn();
      const removeSpy = vi.fn();

      const anchorMock = {
        setAttribute: vi.fn(),
        click: clickSpy,
        remove: removeSpy,
      } as unknown as HTMLAnchorElement;

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchorMock);
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildSpy);

      service.add('entry1');
      service.download();

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(anchorMock.setAttribute).toHaveBeenCalledWith('href', expect.stringContaining('data:text/json'));
      expect(anchorMock.setAttribute).toHaveBeenCalledWith('download', 'log.json');
      expect(appendSpy).toHaveBeenCalledWith(anchorMock);
      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendSpy.mockRestore();
    });
  });
});
