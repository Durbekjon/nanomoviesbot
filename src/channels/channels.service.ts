import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Channel } from '@prisma/client';

@Injectable()
export class ChannelsService {
  private readonly CACHE_KEY = 'channels:all';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async addChannel(
    channelId: bigint,
    title: string,
    inviteLink: string,
  ): Promise<Channel> {
    const channel = await this.prisma.channel.upsert({
      where: { channelId },
      create: { channelId, title, inviteLink },
      update: { title, inviteLink },
    });
    await this.redisService.del(this.CACHE_KEY);
    return channel;
  }

  async removeChannel(channelId: bigint): Promise<Channel> {
    const channel = await this.prisma.channel.delete({
      where: { channelId },
    });
    await this.redisService.del(this.CACHE_KEY);
    return channel;
  }

  async findAll(): Promise<Channel[]> {
    const cached = await this.redisService.getJson<Channel[]>(this.CACHE_KEY);
    if (cached) return cached;

    const channels = await this.prisma.channel.findMany();
    await this.redisService.setJson(this.CACHE_KEY, channels, 3600); // 1 hour
    return channels;
  }

  async findById(id: number): Promise<Channel | null> {
    return this.prisma.channel.findUnique({ where: { id } });
  }

  async update(id: number, data: { title?: string; inviteLink?: string }) {
    const channel = await this.prisma.channel.update({
      where: { id },
      data,
    });
    await this.redisService.del(this.CACHE_KEY);
    return channel;
  }

  async delete(id: number) {
    const channel = await this.prisma.channel.delete({ where: { id } });
    return channel;
  }

  async setMainChannel(channelId: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.channel.updateMany({
        where: { isMain: true },
        data: { isMain: false },
      }),
      this.prisma.channel.update({
        where: { id: channelId },
        data: { isMain: true },
      }),
    ]);
    await this.redisService.del(this.CACHE_KEY);
  }

  async getMainChannel(): Promise<Channel | null> {
    // Only fetch main channel info, not cached with 'all' usually, but ok.
    // For simplicity, we can fetch directly or filter form cache.
    // Let's fetch directly to be sure.
    return this.prisma.channel.findFirst({
      where: { isMain: true },
    });
  }
}
