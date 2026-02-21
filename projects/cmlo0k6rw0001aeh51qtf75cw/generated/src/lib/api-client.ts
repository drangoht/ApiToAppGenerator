const API_BASE_URL = 'https://api.thecatapi.com/v1';

export class ApiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async searchImages(params: {
    limit?: number;
    page?: number;
    order?: 'ASC' | 'DESC' | 'RANDOM';
    has_breeds?: boolean;
  }) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    return this.fetch<CatImage[]>(`/images/search?${searchParams.toString()}`);
  }

  async getBreeds() {
    return this.fetch<Breed[]>('/breeds');
  }

  async getFavorites() {
    return this.fetch<Favorite[]>('/favourites');
  }

  async addFavorite(imageId: string, subId?: string) {
    return this.fetch<{ message: string; id: number }>('/favourites', {
      method: 'POST',
      body: JSON.stringify({ image_id: imageId, sub_id: subId }),
    });
  }

  async deleteFavorite(favoriteId: number) {
    return this.fetch(`/favourites/${favoriteId}`, {
      method: 'DELETE',
    });
  }

  async addVote(imageId: string, value: 1 | -1, subId?: string) {
    return this.fetch('/votes', {
      method: 'POST',
      body: JSON.stringify({ image_id: imageId, value, sub_id: subId }),
    });
  }
}

export const apiClient = new ApiClient(process.env.NEXT_PUBLIC_CAT_API_KEY || '');