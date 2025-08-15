import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { NodesService } from './nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Nodes')
@Controller('nodes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Post('enrollment-token')
  @Roles('tenant_admin')
  @ApiOperation({ summary: 'Generate node enrollment token' })
  @ApiResponse({ status: 201, description: 'Enrollment token generated' })
  generateEnrollmentToken(@Request() req) {
    return this.nodesService.generateEnrollmentToken(req.user.tenantId, req.user.sub);
  }

  @Get()
  @Roles('global_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Get all nodes' })
  @ApiResponse({ status: 200, description: 'Nodes retrieved successfully' })
  findAll(@Request() req) {
    const tenantId = req.user.type === 'tenant_admin' ? req.user.tenantId : undefined;
    return this.nodesService.findAll(tenantId);
  }

  @Get(':id')
  @Roles('global_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Get node by ID' })
  @ApiResponse({ status: 200, description: 'Node retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  findOne(@Param('id') id: string) {
    return this.nodesService.findOne(id);
  }
}