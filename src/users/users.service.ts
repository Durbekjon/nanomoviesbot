import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(telegramId: number | bigint): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: BigInt(telegramId) },
    });
  }

  async createOrUpdate(data: Prisma.UserCreateInput): Promise<User> {
    const id = BigInt(data.id as bigint | number);
    return this.prisma.user.upsert({
      where: { id },
      create: { ...data, id },
      update: {
        username: data.username,
        firstName: data.firstName,
        updatedAt: new Date(),
      },
    });
  }

  async setRole(telegramId: number | bigint, role: Role): Promise<User> {
    return this.prisma.user.update({
      where: { id: BigInt(telegramId) },
      data: { role },
    });
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  async findById(id: number | bigint): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
  }

  async findAdmins(page = 0, limit = 6): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.SUPERADMIN] },
      },
      skip: page * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: {
        role: { in: [Role.ADMIN, Role.SUPERADMIN] },
      },
    });
  }
}
