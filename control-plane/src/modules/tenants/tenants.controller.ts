import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTenantDto, UpdateTenantDto, InviteTenantAdminDto, AcceptInviteDto } from './dto/tenants.dto';

@ApiTags('Tenants')
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles('global_admin')
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 409, description: 'Domain already exists' })
  create(@Body() createTenantDto: CreateTenantDto, @Request() req) {
    return this.tenantsService.create(createTenantDto, req.user.sub);
  }

  @Get()
  @Roles('global_admin')
  @ApiOperation({ summary: 'Get all tenants' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Tenants retrieved successfully' })
  findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.tenantsService.findAll(page, limit);
  }

  @Get(':id')
  @Roles('global_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Get a tenant by ID' })
  @ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string, @Request() req) {
    // Tenant admins can only view their own tenant
    if (req.user.type === 'tenant_admin' && req.user.tenantId !== id) {
      throw new Error('Access denied');
    }
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @Roles('global_admin')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto, @Request() req) {
    return this.tenantsService.update(id, updateTenantDto, req.user.sub);
  }

  @Delete(':id')
  @Roles('global_admin')
  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete tenant with active resources' })
  remove(@Param('id') id: string, @Request() req) {
    return this.tenantsService.remove(id, req.user.sub);
  }

  @Post(':id/invite-admin')
  @Roles('global_admin')
  @ApiOperation({ summary: 'Invite a tenant administrator' })
  @ApiResponse({ status: 201, description: 'Invite sent successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  inviteAdmin(@Param('id') id: string, @Body() inviteDto: InviteTenantAdminDto, @Request() req) {
    return this.tenantsService.inviteAdmin(id, inviteDto, req.user.sub);
  }

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept tenant admin invite' })
  @ApiResponse({ status: 200, description: 'Invite accepted successfully' })
  @ApiResponse({ status: 404, description: 'Invalid invite token' })
  acceptInvite(@Body() acceptInviteDto: AcceptInviteDto) {
    return this.tenantsService.acceptInvite(acceptInviteDto.inviteToken, acceptInviteDto.newPassword);
  }

  @Get(':id/usage')
  @Roles('global_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Get tenant usage statistics' })
  @ApiResponse({ status: 200, description: 'Usage stats retrieved successfully' })
  getUsageStats(@Param('id') id: string, @Request() req) {
    // Tenant admins can only view their own tenant stats
    if (req.user.type === 'tenant_admin' && req.user.tenantId !== id) {
      throw new Error('Access denied');
    }
    return this.tenantsService.getUsageStats(id);
  }
}