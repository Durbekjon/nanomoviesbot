import { Module } from '@nestjs/common';
import { MovieRequestsService } from './movie-requests.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MovieRequestsService],
  exports: [MovieRequestsService],
})
export class MovieRequestsModule {}
