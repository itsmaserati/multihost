import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AgentService } from './agent.service';

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('heartbeat')
  @ApiOperation({ summary: 'Agent heartbeat endpoint' })
  async heartbeat(@Headers('authorization') auth: string, @Body() metrics: any) {
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = auth.substring(7);
    const node = await this.agentService.authenticateAgent(token);
    
    return this.agentService.handleHeartbeat(node.id, metrics);
  }
}