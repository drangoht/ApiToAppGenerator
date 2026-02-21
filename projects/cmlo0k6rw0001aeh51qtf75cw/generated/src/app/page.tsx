'use client';

import { useEffect } from 'react';
import { useCatStore } from '@/store/use-cat-store';
import { CatCard } from '@/components/cat-card';

export default function Home() {
  const { images, favorites, loading, error, fetchImages, fetchFavorites } = useCatStore();

  useEffect(() => {
    fetchImages();
    fetchFavorites();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Cat Explorer</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {images.map((image) => (
          <CatCard
            key={image.id}
            image={image}
            isFavorite={favorites.some((f) => f.image_id === image.id)}
          />
        ))}
      </div>
    </main>
  );
}