import { CatImage } from '@/types/api';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Heart } from 'lucide-react';
import { useCatStore } from '@/store/use-cat-store';

interface CatCardProps {
  image: CatImage;
  isFavorite?: boolean;
}

export function CatCard({ image, isFavorite }: CatCardProps) {
  const { addFavorite, removeFavorite } = useCatStore();

  const handleFavoriteClick = async () => {
    if (isFavorite) {
      // Find the favorite ID and remove it
      const favorite = useCatStore.getState().favorites.find(f => f.image_id === image.id);
      if (favorite) {
        await removeFavorite(favorite.id);
      }
    } else {
      await addFavorite(image.id);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <img
          src={image.url}
          alt={image.breeds?.[0]?.name || 'Cat'}
          className="w-full h-64 object-cover"
        />
      </CardContent>
      <CardFooter className="p-4 flex justify-between items-center">
        <div>
          {image.breeds?.[0]?.name && (
            <p className="text-sm font-medium">{image.breeds[0].name}</p>
          )}
        </div>
        <button
          onClick={handleFavoriteClick}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <Heart
            className={`h-5 w-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-500'}`}
          />
        </button>
      </CardFooter>
    </Card>
  );
}