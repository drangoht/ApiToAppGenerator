export interface CatImage {
  id: string;
  url: string;
  width: number;
  height: number;
  breeds?: Breed[];
  categories?: Category[];
}

export interface Breed {
  id: string;
  name: string;
  description: string;
  temperament: string;
  origin: string;
  life_span: string;
  weight: {
    imperial: string;
    metric: string;
  };
  image?: {
    id: string;
    url: string;
    width: number;
    height: number;
  };
}

export interface Category {
  id: number;
  name: string;
}

export interface Favorite {
  id: number;
  user_id: string;
  image_id: string;
  sub_id?: string;
  created_at: string;
  image: CatImage;
}

export interface Vote {
  id: number;
  image_id: string;
  sub_id?: string;
  value: number;
  created_at: string;
}