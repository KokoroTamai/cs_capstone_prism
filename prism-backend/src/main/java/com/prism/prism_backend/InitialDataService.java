package com.prism.prism_backend;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class InitialDataService {

    private static final Logger log = LoggerFactory.getLogger(InitialDataService.class);

    private static final int TARGET_POOL_SIZE = 5; // 目標ストック数
    private final AtomicBoolean isReplenishing = new AtomicBoolean(false); // 重複補充防止フラグ

    // ★ プール補充専用のシングルスレッドExecutor（共通ForkJoinPoolの枯渇を防ぐ）
    private final ExecutorService poolExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "prism-pool-replenisher");
        thread.setDaemon(true);
        return thread;
    });

    private final FolderRepository folderRepository;
    private final DeckRepository deckRepository;
    private final CardRepository cardRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public InitialDataService(FolderRepository folderRepository,
                              DeckRepository deckRepository,
                              CardRepository cardRepository) {
        this.folderRepository = folderRepository;
        this.deckRepository = deckRepository;
        this.cardRepository = cardRepository;
    }

    /**
     * 新規ユーザーへの即時アサイン（数十ミリ秒）
     */
    @Transactional
    public void assignPrebuiltDeckToUser(UUID newUserId) {
        if (folderRepository.existsByUserIdAndName(newUserId, "GENKI Kanji")) {
            log.info("既に GENKI Kanji を所持しているためアサインをスキップします (userId: {})", newUserId);
            return;
        }

        long startTime = System.currentTimeMillis();
        List<Folder> pooledFolders = folderRepository.findByUserIdIsNullAndName("GENKI Kanji");

        if (!pooledFolders.isEmpty()) {
            Folder pooledFolder = pooledFolders.get(0);
            pooledFolder.setUserId(newUserId);
            folderRepository.save(pooledFolder);

            List<Deck> decks = deckRepository.findByFolderId(pooledFolder.getId());
            for (Deck deck : decks) {
                deck.setUserId(newUserId);
            }
            deckRepository.saveAll(decks);

            long duration = System.currentTimeMillis() - startTime;
            log.info("プールからデッキを即時割り当て完了 ({}ms, userId: {})", duration, newUserId);
        } else {
            log.warn("プール在庫切れのため同期作成を実行します (userId: {})", newUserId);
            createGenkiData(newUserId);
        }

        // コミット後に専用スレッドプールで補充を実行
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    CompletableFuture.runAsync(InitialDataService.this::replenishPoolInternal, poolExecutor);
                }
            });
        } else {
            CompletableFuture.runAsync(this::replenishPoolInternal, poolExecutor);
        }
    }

    /**
     * プール補充の内部実行ロジック
     */
    public void replenishPoolInternal() {
        if (!isReplenishing.compareAndSet(false, true)) {
            return;
        }
        try {
            while (true) {
                List<Folder> currentPool = folderRepository.findByUserIdIsNullAndName("GENKI Kanji");
                if (currentPool.size() >= TARGET_POOL_SIZE) {
                    break;
                }
                log.info("プール在庫補充を実行中... (現在: {} / 目標: {})", currentPool.size(), TARGET_POOL_SIZE);
                createGenkiData(null);
            }
        } catch (Exception e) {
            log.error("プール在庫補充処理中にエラーが発生しました", e);
        } finally {
            isReplenishing.set(false);
        }
    }

    /**
     * バックグラウンドで在庫を TARGET_POOL_SIZE (5個) まで補充
     */
    @Async
    public void replenishPoolAsync() {
        if (!isReplenishing.compareAndSet(false, true)) {
            log.info("すでにプール補充処理が実行中のためスキップします。");
            return;
        }

        try {
            while (true) {
                List<Folder> currentPool = folderRepository.findByUserIdIsNullAndName("GENKI Kanji");
                int currentCount = currentPool.size();

                if (currentCount >= TARGET_POOL_SIZE) {
                    log.info("プール在庫が十分あります (現在: {} / 目標: {})", currentCount, TARGET_POOL_SIZE);
                    break;
                }

                log.info("プール在庫を補充中... (現在: {} / 目標: {})", currentCount, TARGET_POOL_SIZE);
                createGenkiData(null);
            }
        } catch (Exception e) {
            log.error("プール補充中にエラーが発生しました: {}", e.getMessage(), e);
        } finally {
            isReplenishing.set(false);
        }
    }

    /**
     * アプリ起動時にプール在庫をチェックして補充を開始するメソッド
     */
    public void initPool() {
        replenishPoolAsync();
    }

    /**
     * 1セット分のデータ作成（JPA版）
     */
    @Transactional
    public void createGenkiData(UUID targetUserId) {
        long startTime = System.currentTimeMillis();
        try {
            ClassPathResource resource = new ClassPathResource("genki_kanji.json");
            if (!resource.exists()) {
                log.error("genki_kanji.json cannot be found in classpath");
                return;
            }

            List<DeckSeedDto> seedData;
            try (InputStream is = resource.getInputStream()) {
                seedData = objectMapper.readValue(is, new TypeReference<List<DeckSeedDto>>() {});
            }

            String folderName = "GENKI Kanji";
            Folder targetFolder;

            List<Folder> existing;
            if (targetUserId != null) {
                existing = folderRepository.findAllByUserIdAndName(targetUserId, folderName);
            } else {
                existing = folderRepository.findByUserIdIsNullAndName(folderName);
            }

            if (!existing.isEmpty()) {
                for (Folder oldFolder : existing) {
                    deckRepository.deleteByFolderIdAndUserId(oldFolder.getId(), targetUserId);
                    folderRepository.delete(oldFolder);
                }
            }

            targetFolder = folderRepository.save(new Folder(targetUserId, folderName));

            List<Card> allCards = new ArrayList<>();

            for (DeckSeedDto deckDto : seedData) {
                Deck deck = new Deck();
                deck.setUserId(targetUserId);
                deck.setTitle(deckDto.title());
                deck.setDescription(deckDto.description() != null ? deckDto.description() : "");
                deck.setFolderId(targetFolder.getId());

                Deck savedDeck = deckRepository.save(deck);

                if (deckDto.cards() == null) continue;

                for (CardSeedDto cardDto : deckDto.cards()) {
                    Card card = new Card();
                    card.setDeck(savedDeck);

                    List<CardFacet> facets = new ArrayList<>();
                    if (cardDto.facets() != null) {
                        for (int i = 0; i < cardDto.facets().size(); i++) {
                            FacetSeedDto fDto = cardDto.facets().get(i);
                            CardFacet facet = new CardFacet();
                            facet.setCard(card);
                            facet.setLabel(fDto.label());
                            facet.setContent(fDto.content());
                            facet.setFacetOrder(i);
                            facets.add(facet);
                        }
                    }
                    card.setFacets(facets);
                    allCards.add(card);
                }
            }

            if (!allCards.isEmpty()) {
                cardRepository.saveAll(allCards);
            }

            long duration = System.currentTimeMillis() - startTime;
            log.info("GENKIデータ作成完了: {} デッキ ({}ms, userId: {})", seedData.size(), duration, targetUserId);

        } catch (Exception e) {
            log.error("データ作成中にエラーが発生しました: {}", e.getMessage(), e);
            throw new RuntimeException(e);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DeckSeedDto(
            Integer lesson,
            String title,
            String description,
            String folder,
            List<CardSeedDto> cards
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CardSeedDto(
            List<FacetSeedDto> facets
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FacetSeedDto(
            String label,
            String content
    ) {}
}