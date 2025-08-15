import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { authenticator } from 'node-2fa';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto, RefreshTokenDto, Enable2FADto, Verify2FADto } from './dto/auth.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  type: 'global_admin' | 'tenant_admin' | 'user';
  tenantId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string, userType: 'global_admin' | 'tenant_admin' | 'user' = 'global_admin') {
    let user;

    switch (userType) {
      case 'global_admin':
        user = await this.prisma.globalAdmin.findUnique({ where: { email, active: true } });
        break;
      case 'tenant_admin':
        user = await this.prisma.tenantAdmin.findUnique({ 
          where: { email, active: true },
          include: { tenant: true }
        });
        break;
      case 'user':
        user = await this.prisma.user.findFirst({ 
          where: { email, active: true },
          include: { tenant: true }
        });
        break;
    }

    if (!user) {
      return null;
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return { ...result, type: userType };
  }

  async login(loginDto: LoginDto) {
    const { email, password, twoFaCode, userType = 'global_admin' } = loginDto;

    const user = await this.validateUser(email, password, userType);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check 2FA if enabled
    if (user.twoFaSecret && !twoFaCode) {
      throw new UnauthorizedException('2FA code required');
    }

    if (user.twoFaSecret && twoFaCode) {
      const isValid = authenticator.check(twoFaCode, user.twoFaSecret);
      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    // Update last login
    if (userType === 'tenant_admin') {
      await this.prisma.tenantAdmin.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } else if (userType === 'user') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: userType,
      tenantId: user.tenantId || user.tenant?.id,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id, userType);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || `${user.firstName} ${user.lastName}`,
        type: userType,
        tenantId: user.tenantId || user.tenant?.id,
        has2FA: !!user.twoFaSecret,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        globalAdmin: true,
        tenantAdmin: { include: { tenant: true } },
        user: { include: { tenant: true } },
      },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let user;
    let userType: 'global_admin' | 'tenant_admin' | 'user';

    if (storedToken.globalAdmin) {
      user = storedToken.globalAdmin;
      userType = 'global_admin';
    } else if (storedToken.tenantAdmin) {
      user = storedToken.tenantAdmin;
      userType = 'tenant_admin';
    } else if (storedToken.user) {
      user = storedToken.user;
      userType = 'user';
    } else {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: userType,
      tenantId: user.tenantId || user.tenant?.id,
    };

    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = await this.generateRefreshToken(user.id, userType);

    // Delete old refresh token
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async enable2FA(userId: string, userType: 'global_admin' | 'tenant_admin' | 'user', enable2FADto: Enable2FADto) {
    const { secret } = enable2FADto;

    switch (userType) {
      case 'global_admin':
        await this.prisma.globalAdmin.update({
          where: { id: userId },
          data: { twoFaSecret: secret },
        });
        break;
      case 'tenant_admin':
        await this.prisma.tenantAdmin.update({
          where: { id: userId },
          data: { twoFaSecret: secret },
        });
        break;
      case 'user':
        await this.prisma.user.update({
          where: { id: userId },
          data: { twoFaSecret: secret },
        });
        break;
    }

    return { message: '2FA enabled successfully' };
  }

  async disable2FA(userId: string, userType: 'global_admin' | 'tenant_admin' | 'user', verify2FADto: Verify2FADto) {
    const { code } = verify2FADto;

    let user;
    switch (userType) {
      case 'global_admin':
        user = await this.prisma.globalAdmin.findUnique({ where: { id: userId } });
        break;
      case 'tenant_admin':
        user = await this.prisma.tenantAdmin.findUnique({ where: { id: userId } });
        break;
      case 'user':
        user = await this.prisma.user.findUnique({ where: { id: userId } });
        break;
    }

    if (!user?.twoFaSecret) {
      throw new UnauthorizedException('2FA not enabled');
    }

    const isValid = authenticator.check(code, user.twoFaSecret);
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    switch (userType) {
      case 'global_admin':
        await this.prisma.globalAdmin.update({
          where: { id: userId },
          data: { twoFaSecret: null },
        });
        break;
      case 'tenant_admin':
        await this.prisma.tenantAdmin.update({
          where: { id: userId },
          data: { twoFaSecret: null },
        });
        break;
      case 'user':
        await this.prisma.user.update({
          where: { id: userId },
          data: { twoFaSecret: null },
        });
        break;
    }

    return { message: '2FA disabled successfully' };
  }

  async generate2FASecret(email: string) {
    const secret = authenticator.generateSecret({
      name: email,
      service: 'Pterodactyl Control Plane',
    });

    return {
      secret: secret.secret,
      qr: secret.qr,
      uri: secret.uri,
    };
  }

  async logout(userId: string, userType: 'global_admin' | 'tenant_admin' | 'user') {
    const whereClause = userType === 'global_admin' 
      ? { globalAdminId: userId }
      : userType === 'tenant_admin'
      ? { tenantAdminId: userId }
      : { userId };

    await this.prisma.refreshToken.deleteMany({
      where: whereClause,
    });

    return { message: 'Logged out successfully' };
  }

  private async generateRefreshToken(userId: string, userType: 'global_admin' | 'tenant_admin' | 'user') {
    const token = nanoid(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const data = {
      token,
      expiresAt,
      ...(userType === 'global_admin' && { globalAdminId: userId }),
      ...(userType === 'tenant_admin' && { tenantAdminId: userId }),
      ...(userType === 'user' && { userId }),
    };

    await this.prisma.refreshToken.create({ data });
    return token;
  }
}