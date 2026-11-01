package com.prism.prism_backend;

import com.prism.prism_backend.Deck;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public interface DeckRepository extends JpaRepository<Deck, UUID> {

    // ログイン中のユーザーIDに一致するデッキのみ、作成日時降順で取得
    List<Deck> findByUserIdOrderByCreatedAtDesc(UUID userId);

    // 指定されたユーザーID、タイトル、フォルダIDに一致するデッキが存在するかを確認
    boolean existsByUserIdAndTitleAndFolderId(UUID userId, String title, Long folderId);

    // JPAの1件ずつループ削除をスキップし、DB側で直接一括削除する
    @Modifying
    @Transactional
    @Query(value = "DELETE FROM decks WHERE id = :id AND user_id = :userId", nativeQuery = true)
    int deleteByIdAndUserIdDirectly(@Param("id") UUID id, @Param("userId") UUID userId);

    // ★ フォルダーIDに紐づくデッキ一覧を取得
    List<Deck> findByFolderId(Long folderId);

    // ==========================================
    // ★ ここから追加
    // ==========================================

    // フォルダーとその中身全削除用: 所属デッキを一括削除
    @Modifying
    @Transactional
    @Query(value = "DELETE FROM decks WHERE folder_id = :folderId AND user_id = :userId", nativeQuery = true)
    int deleteByFolderIdAndUserId(@Param("folderId") Long folderId, @Param("userId") UUID userId);
}