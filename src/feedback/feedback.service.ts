import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Feedback, Prisma } from '@prisma/client';

export type FeedbackWithUser = Prisma.FeedbackGetPayload<{
  include: { user: true };
}>;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: bigint, message: string): Promise<Feedback> {
    return this.prisma.feedback.create({
      data: {
        userId,
        message,
      },
    });
  }

  async findAllUnresolved(): Promise<FeedbackWithUser[]> {
    return this.prisma.feedback.findMany({
      where: { isResolved: false },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolve(id: number): Promise<Feedback> {
    return this.prisma.feedback.update({
      where: { id },
      data: { isResolved: true },
    });
  }

  async delete(id: number): Promise<Feedback> {
    return this.prisma.feedback.delete({
      where: { id },
    });
  }
}
