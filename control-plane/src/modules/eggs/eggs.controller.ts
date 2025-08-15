import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EggsService } from './eggs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Eggs')
@Controller('eggs')
@UseGuards(JwtAuthGuard)
export class EggsController {
  constructor(private readonly eggsService: EggsService) {}

  @Get()
  findAll(@Request() req) {
    const tenantId = req.user.type === 'tenant_admin' ? req.user.tenantId : undefined;
    return this.eggsService.findAll(tenantId);
  }

  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles('global_admin')
  syncFromPterodactyl() {
    return this.eggsService.syncFromPterodactyl();
  }
}