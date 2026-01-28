import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Movie, Prisma, Category } from '@prisma/client';

@Injectable()
export class MoviesService {
  private readonly CAT_CACHE_KEY = 'movies:categories';
  private readonly TOP_CACHE_KEY = 'movies:trending';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findByCode(code: number): Promise<Movie | null> {
    return this.prisma.movie.findUnique({
      where: { code },
      include: { category: true },
    });
  }

  async findById(id: number): Promise<Movie | null> {
    return this.prisma.movie.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  async findByCategory(categoryId: number): Promise<Movie[]> {
    return this.prisma.movie.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByTitle(query: string): Promise<Movie[]> {
    return this.prisma.movie.findMany({
      where: {
        title: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 20,
    });
  }

  async getAllCategories(): Promise<Category[]> {
    const cached = await this.redisService.getJson<Category[]>(
      this.CAT_CACHE_KEY,
    );
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    await this.redisService.setJson(this.CAT_CACHE_KEY, categories, 600); // 10 min
    return categories;
  }

  async addCategory(name: string): Promise<Category> {
    const category = await this.prisma.category.create({
      data: { name },
    });
    await this.redisService.del(this.CAT_CACHE_KEY);
    return category;
  }

  async deleteCategory(id: number): Promise<Category> {
    const category = await this.prisma.category.delete({
      where: { id },
    });
    await this.redisService.del(this.CAT_CACHE_KEY);
    return category;
  }

  async getTopMovies(limit: number = 10): Promise<Movie[]> {
    const cached = await this.redisService.getJson<Movie[]>(this.TOP_CACHE_KEY);
    if (cached) return cached;

    // Movies with most views
    const movies = await this.prisma.movie.findMany({
      take: limit,
      orderBy: {
        views: {
          _count: 'desc',
        },
      },
    });
    await this.redisService.setJson(this.TOP_CACHE_KEY, movies, 1800); // 30 min
    return movies;
  }

  async getRandom(): Promise<Movie | null> {
    const count = await this.prisma.movie.count();
    if (count === 0) return null;
    const skip = Math.floor(Math.random() * count);
    const [movie] = await this.prisma.movie.findMany({
      take: 1,
      skip: skip,
      include: { category: true },
    });
    return movie || null;
  }

  async create(data: Prisma.MovieCreateInput): Promise<Movie> {
    return this.prisma.movie.create({
      data,
    });
  }

  async addView(userId: bigint, movieId: number): Promise<void> {
    try {
      await this.prisma.movieView.create({
        data: {
          userId,
          movieId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return;
        }
      }
      throw error;
    }
  }

  async addRating(
    userId: bigint,
    movieId: number,
    score: number,
  ): Promise<void> {
    await this.prisma.rating.upsert({
      where: {
        userId_movieId: {
          userId,
          movieId,
        },
      },
      update: { score },
      create: {
        userId,
        movieId,
        score,
      },
    });
  }

  async getAverageRating(movieId: number): Promise<number> {
    const aggregate = await this.prisma.rating.aggregate({
      where: { movieId },
      _avg: {
        score: true,
      },
    });
    return aggregate._avg.score || 0;
  }

  async getViews(movieId: number): Promise<number> {
    return this.prisma.movieView.count({
      where: { movieId },
    });
  }

  async countMovies(): Promise<number> {
    return this.prisma.movie.count();
  }

  async countTotalViews(): Promise<number> {
    return this.prisma.movieView.count();
  }

  async delete(id: number) {
    return this.prisma.movie.delete({ where: { id } });
  }

  async update(id: number, data: Prisma.MovieUpdateInput) {
    return this.prisma.movie.update({
      where: { id },
      data,
    });
  }
}
