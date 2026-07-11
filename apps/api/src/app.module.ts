import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { TenantContextMiddleware } from './auth/tenant-context.middleware.js';
import { ApiController } from './api/api.controller.js';
import { ApiService } from './api/api.service.js';

@Module({
  controllers: [AuthController, ApiController],
  providers: [ApiService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Derive tenant context from the session on every route.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
