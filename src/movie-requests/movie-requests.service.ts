import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovieRequest, User } from '@prisma/client';

export type MovieRequestWithUser = MovieRequest & { user: User };

@Injectable()
export class MovieRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: bigint, title: string): Promise<MovieRequest> {
    return this.prisma.movieRequest.create({
      data: {
        userId,
        title,
      },
    });
  }

  async findAllPending(): Promise<MovieRequestWithUser[]> {
    return this.prisma.movieRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    }) as any;
  }

  async updateStatus(id: number, status: string): Promise<MovieRequest> {
    return this.prisma.movieRequest.update({
      where: { id },
      data: { status },
    });
  }

  async countPending(): Promise<number> {
    return this.prisma.movieRequest.count({
      where: { status: 'PENDING' },
    });
  }
}
