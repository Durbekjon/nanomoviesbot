import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { UsersModule } from './users/users.module';
import { MoviesModule } from './movies/movies.module';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ChannelsModule } from './channels/channels.module';
import { MovieRequestsModule } from './movie-requests/movie-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BotModule,
    UsersModule,
    MoviesModule,
    CommonModule,
    RedisModule,
    FeedbackModule,
    ChannelsModule,
    MovieRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
