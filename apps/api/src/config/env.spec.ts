import { loadEnv } from './env';

describe('loadEnv', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: '0123456789abcdef' };

  it('aplica valores por omisión', () => {
    expect(loadEnv(base)).toMatchObject({ PORT: 3000, JWT_EXPIRES_IN: '12h', ADMIN_NAME: 'Administrador' });
  });

  it('explica en español qué variable falta o es inválida', () => {
    expect(() => loadEnv({ JWT_SECRET: 'corto' })).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET: JWT_SECRET debe tener al menos 16/);
  });

  it('trata las variables vacías como no definidas', () => {
    expect(loadEnv({ ...base, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }).ADMIN_EMAIL).toBeUndefined();
  });
});
