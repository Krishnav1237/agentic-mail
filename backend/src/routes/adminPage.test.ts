import { describe, expect, it } from 'vitest';
import { renderAdminPage } from './adminPage.js';

describe('admin page', () => {
  it('includes the Google auth entry point', () => {
    const html = renderAdminPage();

    expect(html).toContain('Inbox Intelligence Layer backend admin');
    expect(html).toContain('href="/auth/google"');
    expect(html).toContain('typing <strong>admin</strong>');
  });
});
