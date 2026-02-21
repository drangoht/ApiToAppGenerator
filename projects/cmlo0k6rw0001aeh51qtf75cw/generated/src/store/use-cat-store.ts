import { create } from 'zustand';
import { CatImage, Breed, Favorite } from '@/types/api';
import { apiClient } from '@/lib/api-client';

interface CatStore {
  images: CatImage[];
  breeds: Breed[];
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
  fetchImages: (params?: { limit?: number; page?: number }) => Promise<void>;
  fetchBreeds: () => Promise<void>;
  fetchFavorites: () => Promise<void>;
  addFavorite: (imageId: string) => Promise<void>;
  removeFavorite: (favoriteId: number) => Promise<void>;
}

export const useCatStore = create<CatStore>((set, get) => ({
  images: [],
  breeds: [],
  favorites: [],
  loading: false,
  error: null,

  fetchImages: async (params = { limit: 10, page: 0 }) => {
    set({ loading: true, error: null });
    try {
      const images = await apiClient.searchImages(params);
      set({ images, loading: false });
    } catch (error) {
      set({ error: 'Failed to fetch images', loading: false });
    }
  },

  fetchBreeds: async () => {
    set({ loading: true, error: null });
    try {
      const breeds = await apiClient.getBreeds();
      set({ breeds, loading: false });
    } catch (error) {
      set({ error: 'Failed to fetch breeds', loading: false });
    }
  },

  fetchFavorites: async () => {
    set({ loading: true, error: null });
    try {
      const favorites = await apiClient.getFavorites();
      set({ favorites, loading: false });
    } catch (error) {
      set({ error: 'Failed to fetch favorites', loading: false });
    }
  },

  addFavorite: async (imageId: string) => {
    try {
      await apiClient.addFavorite(imageId);
      get().fetchFavorites();
    } catch (error) {
      set({ error: 'Failed to add favorite' });
    }
  },

  removeFavorite: async (favoriteId: number) => {
    try {
      await apiClient.deleteFavorite(favoriteId);
      get().fetchFavorites();
    } catch (error) {
      set({ error: 'Failed to remove favorite' });
    }
  },
}));