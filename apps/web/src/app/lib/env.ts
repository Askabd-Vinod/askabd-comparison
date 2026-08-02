/**
 * Environment configuration for the frontend.
 * Derived from NEXT_PUBLIC_* variables.
 */

export type Environment = 'development' | 'staging' | 'production';

export function getEnvironment(): Environment {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
  if (apiUrl.includes('staging')) return 'staging';
  if (apiUrl.includes('api.askabd.com') || apiUrl.includes('production')) return 'production';
  return 'development';
}

export function getEnvConfig() {
  return {
    environment: getEnvironment(),
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200',
    version: '0.4.0',
    buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER || 'local',
  };
}

export function envColor(env: Environment): string {
  switch (env) {
    case 'development': return 'bg-green-500';
    case 'staging': return 'bg-yellow-500';
    case 'production': return 'bg-red-500';
  }
}

export function envLabel(env: Environment): string {
  return env.toUpperCase().slice(0, 3);
}
