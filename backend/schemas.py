from datetime import datetime
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MovieRef(BaseModel):
    movie_id: int
    movie_title: str


class ReviewCreate(BaseModel):
    movie_id: int
    movie_title: str
    body: str = Field(min_length=1, max_length=2000)


class RatingCreate(BaseModel):
    movie_id: int
    movie_title: str
    stars: float = Field(ge=0.5, le=5)


class HistoryCreate(BaseModel):
    movie_id: int
    movie_title: str
    progress_pct: int = Field(default=100, ge=0, le=100)


class CompareRequest(BaseModel):
    title_a: str = Field(min_length=1, max_length=200)
    title_b: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)