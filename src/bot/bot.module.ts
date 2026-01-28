import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { UsersModule } from '../users/users.module';
import { MoviesModule } from '../movies/movies.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { ChannelsModule } from '../channels/channels.module';
import { MovieRequestsModule } from '../movie-requests/movie-requests.module';

@Module({
  imports: [
    UsersModule,
    MoviesModule,
    FeedbackModule,
    ChannelsModule,
    MovieRequestsModule,
  ],
  providers: [BotService],
})
export class BotModule {}
