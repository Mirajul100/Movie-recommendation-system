from datetime import datetime

from sqlalchemy import (Column, Integer, String, Float, DateTime,
                         ForeignKey, UniqueConstraint, Text, Boolean)
from sqlalchemy.orm import relationship

from backend.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    watchlist = relationship("WatchlistItem", back_populates="user", cascade="all, delete-orphan")
    history = relationship("WatchHistory", back_populates="user", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="user", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")


class Favorite(Base):
    __tablename__ = "favorites"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="favorites")
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_user_favorite"),)


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="watchlist")
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_user_watchlist"),)


class WatchHistory(Base):
    __tablename__ = "watch_history"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    progress_pct = Column(Integer, default=100)  # supports "Continue Watching"
    viewed_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="history")


class Rating(Base):
    __tablename__ = "ratings"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    stars = Column(Float, nullable=False)  # 1-5 (or 1-10, frontend can scale)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="ratings")
    __table_args__ = (UniqueConstraint("user_id", "movie_id", name="uq_user_rating"),)


class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="reviews")


class SearchLog(Base):
    __tablename__ = "search_logs"
    id = Column(Integer, primary_key=True)
    query = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
