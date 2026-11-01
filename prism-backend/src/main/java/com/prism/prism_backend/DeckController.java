package com.prism.prism_backend;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/decks")
@CrossOrigin(origins = "http://localhost:5173")
public class DeckController {

    private final DeckRepository deckRepository;
    private final CardRepository cardRepository;
    private final InitialDataService initialDataService;

    public DeckController(DeckRepository deckRepository, CardRepository cardRepository, InitialDataService initialDataService) {
        this.deckRepository = deckRepository;
        this.cardRepository = cardRepository;
        this.initialDataService = initialDataService;
    }

    // 1. ログインユーザー本人のデッキ一覧のみ取得
    @GetMapping
    public ResponseEntity<List<Deck>> getAllDecks(@RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {
        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UUID userId = UUID.fromString(userIdHeader);

        List<Deck> decks = deckRepository.findByUserIdOrderByCreatedAtDesc(userId);
        return ResponseEntity.ok(decks);
    }

    // 2. デッキ新規作成（DTO を利用）
    @PostMapping
    public ResponseEntity<?> createDeck(
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @RequestBody DeckCreateRequest request) {

        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("ユーザー認証が必要です");
        }

        if (request.getTitle() == null || request.getTitle().trim().isEmpty()) {
            return ResponseEntity.badRequest().body("タイトルは必須です");
        }

        UUID userId = UUID.fromString(userIdHeader);

        Deck deck = new Deck();
        deck.setUserId(userId);
        deck.setTitle(request.getTitle().trim());
        deck.setDescription(request.getDescription() != null ? request.getDescription().trim() : "");
        deck.setFolderId(request.getFolder());

        Deck saved = deckRepository.save(deck);
        return ResponseEntity.ok(saved);
    }

    // 3. デッキ更新（DTO を利用）
    @PutMapping("/{id}")
    public ResponseEntity<?> updateDeck(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @RequestBody DeckCreateRequest request) {

        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        UUID userId = UUID.fromString(userIdHeader);

        return deckRepository.findById(id).map(deck -> {
            // 他人のデッキは更新不可
            if (!java.util.Objects.equals(deck.getUserId(), userId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You don't have authority to edit the deck.");
            }

            if (request.getTitle() != null && !request.getTitle().trim().isEmpty()) {
                deck.setTitle(request.getTitle().trim());
            }
            if (request.getDescription() != null) {
                deck.setDescription(request.getDescription().trim());
            }
            // フォルダの変更（解除も含む）
            deck.setFolderId(request.getFolder());

            Deck updated = deckRepository.save(deck);
            return ResponseEntity.ok(updated);
        }).orElse(ResponseEntity.notFound().build());
    }

    // 4. デッキ削除（本人のデッキであるか確認）
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteDeck(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {

        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        UUID userId;
        try {
            userId = UUID.fromString(userIdHeader);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("無効なユーザーIDです");
        }

        var deckOpt = deckRepository.findById(id);
        if (deckOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (!java.util.Objects.equals(deckOpt.get().getUserId(), userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("このデッキを削除する権限がありません");
        }

        deckRepository.deleteByIdAndUserIdDirectly(id, userId);

        return ResponseEntity.noContent().build();
    }

    // 5. デッキ内のカード一覧取得
    @GetMapping("/{id}/cards")
    public List<Card> getCardsByDeck(@PathVariable UUID id) {
        return cardRepository.findByDeckId(id);
    }

    // 6. 初期データシード
    @PostMapping("/seed")
    public ResponseEntity<Void> seedUserInitialData(
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {
        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UUID userId = UUID.fromString(userIdHeader);
        initialDataService.assignPrebuiltDeckToUser(userId);
        return ResponseEntity.ok().build();
    }
}