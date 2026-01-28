import { Module } from '@nestjs/common';
import { MoviesService } from './movies.service';

@Module({
  providers: [MoviesService],
  exports: [MoviesService],
})
export class MoviesModule {}
