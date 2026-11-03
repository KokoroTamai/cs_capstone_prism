package com.prism.prism_backend;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
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
@RequestMapping("/api/cards")
@CrossOrigin(originPatterns = {"http://localhost:5173", "https://*.vercel.app"}, allowedHeaders = "*", allowCredentials = "true")
public class CardController {

    private final CardRepository cardRepository;
    private final CardReviewRepository cardReviewRepository;
    private final DeckRepository deckRepository;

    public CardController(CardRepository cardRepository, 
                          CardReviewRepository cardReviewRepository,
                          DeckRepository deckRepository) {
        this.cardRepository = cardRepository;
        this.cardReviewRepository = cardReviewRepository;
        this.deckRepository = deckRepository;
    }

    // ユーザーIDのバリデーション用ヘルパーメソッド
    private UUID parseUserId(String userIdHeader) {
        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return null;
        }
        try {
            return UUID.fromString(userIdHeader.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @GetMapping
    public List<Card> getAllCards() {
        return cardRepository.findAll();
    }

    // ★ カード新規作成（デッキ所有権の検証を追加）
    @PostMapping
    public ResponseEntity<?> createCard(
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @RequestBody CardCreateRequest request) {

        UUID userId = parseUserId(userIdHeader);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User Authentication is required");
        }

        if (request.getDeckId() == null) {
            return ResponseEntity.badRequest().body("Deck ID is required");
        }

        var deckOpt = deckRepository.findById(request.getDeckId());
        if (deckOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Deck deck = deckOpt.get();
        // 他人のデッキにはカードを追加できないよう制御
        if (!Objects.equals(deck.getUserId(), userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You are not the owner of this deck");
        }

        Card card = new Card();
        card.setDeck(deck);

        if (request.getFacets() != null) {
            int order = 0;
            for (CardCreateRequest.FacetDto dto : request.getFacets()) {
                CardFacet facet = new CardFacet();
                facet.setFacetOrder(order++);
                facet.setLabel(dto.getLabel());
                facet.setContent(dto.getContent());
                facet.setCard(card);
                card.getFacets().add(facet);
            }
        }

        Card savedCard = cardRepository.save(card);
        return ResponseEntity.ok(savedCard);
    }

    // ★ カード内容の更新（編集）：@Transactional と所有権チェックを追加
    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<?> updateCard(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @RequestBody CardCreateRequest request) {

        UUID userId = parseUserId(userIdHeader);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User Authentication is required");
        }

        var cardOpt = cardRepository.findById(id);
        if (cardOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Card card = cardOpt.get();
        // カードが属するデッキの所有者かチェック
        if (card.getDeck() != null && !Objects.equals(card.getDeck().getUserId(), userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You are not the owner of this card's deck");
        }

        // 既存の面をクリアして再設定
        card.getFacets().clear();
        if (request.getFacets() != null) {
            int order = 0;
            for (CardCreateRequest.FacetDto dto : request.getFacets()) {
                CardFacet facet = new CardFacet();
                facet.setFacetOrder(order++);
                facet.setLabel(dto.getLabel());
                facet.setContent(dto.getContent());
                facet.setCard(card);
                card.getFacets().add(facet);
            }
        }

        Card updated = cardRepository.save(card);
        return ResponseEntity.ok(updated);
    }

    // ★ カード単体の削除：所有権チェックを追加
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteCard(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {

        UUID userId = parseUserId(userIdHeader);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User Authentication is required");
        }

        var cardOpt = cardRepository.findById(id);
        if (cardOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Card card = cardOpt.get();
        // カードが属するデッキの所有者かチェック
        if (card.getDeck() != null && !Objects.equals(card.getDeck().getUserId(), userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You are not the owner of this card's deck");
        }

        cardRepository.delete(card);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/review")
    public ResponseEntity<Void> recordReview(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String status = body.get("status");
        if (status != null) {
            cardReviewRepository.save(new CardReview(id, status));
        }
        return ResponseEntity.ok().build();
    }
}