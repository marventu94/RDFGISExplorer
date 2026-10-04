import { ValidationPipe } from '@nestjs/common';
import { DiscoveryFocusDto, DiscoveryPathsDto } from './discovery.dto';

describe('discovery request validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  it('rejects missing path focus and invalid nested directions', async () => {
    await expect(
      pipe.transform(
        { targetUri: 'urn:C', targetKind: 'class' },
        { type: 'body', metatype: DiscoveryPathsDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        {
          classUri: 'urn:C',
          steps: [{ predicate: 'urn:p', kind: 'resource', direction: 'bad' }],
        },
        { type: 'body', metatype: DiscoveryFocusDto },
      ),
    ).rejects.toThrow();
  });
  it('bounds path length and strips unknown fields', async () => {
    const step = { predicate: 'urn:p', direction: 'out', kind: 'resource' };
    await expect(
      pipe.transform(
        { classUri: 'urn:C', steps: Array(13).fill(step) },
        { type: 'body', metatype: DiscoveryFocusDto },
      ),
    ).rejects.toThrow();
    const result: DiscoveryFocusDto = (await pipe.transform(
      { classUri: 'urn:C', steps: [step], endpoint: 'http://untrusted' },
      { type: 'body', metatype: DiscoveryFocusDto },
    )) as DiscoveryFocusDto;
    expect(result).not.toHaveProperty('endpoint');
  });
});
