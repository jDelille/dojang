import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      workspaceId: string | null;
      workspaceSlug: string | null;
    };
  }
  interface User {
    id: string;
    email: string;
    name?: string | null;
    role: Role;
    workspaceId: string | null;
    workspaceSlug: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    role: Role;
    workspaceId: string | null;
    workspaceSlug: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login', error: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    // Email + password today; the provider array is the seam for SSO later.
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { workspace: { select: { slug: true } } },
        });

        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: user.workspaceId,
          workspaceSlug: user.workspace?.slug ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.workspaceId = user.workspaceId;
        token.workspaceSlug = user.workspaceSlug;
      }

      // Re-read on explicit update so an onboarding flow or workspace switch
      // is reflected without forcing a re-login.
      if (trigger === 'update' && token.uid) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid },
          include: { workspace: { select: { slug: true } } },
        });
        if (fresh) {
          token.role = fresh.role;
          token.workspaceId = fresh.workspaceId;
          token.workspaceSlug = fresh.workspace?.slug ?? null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid,
        email: session.user?.email ?? '',
        name: session.user?.name,
        role: token.role,
        workspaceId: token.workspaceId,
        workspaceSlug: token.workspaceSlug,
      };
      return session;
    },
  },
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
