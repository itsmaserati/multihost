import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'ws';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  user?: any;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from query string or headers
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      client.user = payload;
      this.logger.log(`Client connected: ${payload.email} (${payload.sub})`);
    } catch (error) {
      this.logger.warn(`Connection rejected: ${error.message}`);
      client.close(1008, 'Authentication failed');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      this.logger.log(`Client disconnected: ${client.user.email}`);
    }
  }

  @SubscribeMessage('console:connect')
  handleConsoleConnect(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { serverId: string },
  ) {
    // In a real implementation, this would establish a connection to the Pterodactyl console
    // For now, just send a mock response
    client.send(JSON.stringify({
      event: 'console:output',
      data: 'Console connection established\n',
    }));
  }

  @SubscribeMessage('console:input')
  handleConsoleInput(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { serverId: string; command: string },
  ) {
    // Forward command to Pterodactyl
    this.logger.log(`Console command from ${client.user.email}: ${data.command}`);
    
    // Mock response
    client.send(JSON.stringify({
      event: 'console:output',
      data: `> ${data.command}\nCommand executed\n`,
    }));
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    // Try to extract from query parameters first
    const url = new URL(client.url, 'ws://localhost');
    const token = url.searchParams.get('token');
    
    if (token) {
      return token;
    }

    // Try to extract from Authorization header
    const authHeader = client.protocol;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}