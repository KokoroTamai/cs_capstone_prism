package com.prism.prism_backend;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface CardRepository extends JpaRepository<Card, Long> {

    // ★ LEFT JOIN FETCH c.facets を追加（1回のクエリで facets も一緒に高速取得）
    @Query("SELECT DISTINCT c FROM Card c LEFT JOIN FETCH c.facets WHERE c.deck.id = :deckId")
    List<Card> findByDeckId(@Param("deckId") UUID deckId);
}