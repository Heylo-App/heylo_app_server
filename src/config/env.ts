import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:8081',

  // Database
  databaseUrl: process.env['DATABASE_URL'] ?? '',

  // Supabase
  supabaseUrl: process.env['SUPABASE_URL'] ?? '',
  supabaseServiceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',

  // JWT
  jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret',
  jwtRefreshSecret: process.env['JWT_REFRESH_SECRET'] ?? 'dev-refresh-secret',
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '15m',
  jwtRefreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',

  // Agora
  agoraAppId: process.env['AGORA_APP_ID'] ?? '',
  agoraAppCertificate: process.env['AGORA_APP_CERTIFICATE'] ?? '',

  // LiveKit
  livekitApiKey: process.env['LIVEKIT_API_KEY'] ?? '',
  livekitApiSecret: process.env['LIVEKIT_API_SECRET'] ?? '',
  livekitUrl: process.env['LIVEKIT_URL'] ?? '',

  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
} as const;
