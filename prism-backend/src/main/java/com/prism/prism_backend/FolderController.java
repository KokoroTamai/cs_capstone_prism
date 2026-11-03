package com.prism.prism_backend;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/folders")
@CrossOrigin(origins = "http://localhost:5173")
public class FolderController {

    private final FolderRepository folderRepository;
    private final DeckRepository deckRepository;

    public FolderController(FolderRepository folderRepository, DeckRepository deckRepository) {
        this.folderRepository = folderRepository;
        this.deckRepository = deckRepository;
    }

    @GetMapping
    public ResponseEntity<List<Folder>> getFolders(@RequestHeader("X-User-Id") String userIdHeader) {
        UUID userId = UUID.fromString(userIdHeader);
        return ResponseEntity.ok(folderRepository.findByUserIdOrderByCreatedAtDesc(userId));
    }

    @PostMapping
    public ResponseEntity<Folder> createFolder(
            @RequestHeader("X-User-Id") String userIdHeader,
            @RequestBody Map<String, String> body) {
        UUID userId = UUID.fromString(userIdHeader);
        String name = body.get("name");
        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        Folder folder = new Folder(userId, name.trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(folderRepository.save(folder));
    }

    // 1. フォルダー名編集
    @PutMapping("/{id}")
    public ResponseEntity<?> updateFolder(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @RequestBody Map<String, String> payload) {

        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UUID userId = UUID.fromString(userIdHeader);

        return folderRepository.findById(id).map(folder -> {
            if (!java.util.Objects.equals(folder.getUserId(), userId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You do not have authority to edit this folder");
            }
            String name = payload.get("name");
            if (name != null && !name.trim().isEmpty()) {
                folder.setName(name.trim());
            }
            return ResponseEntity.ok(folderRepository.save(folder));
        }).orElse(ResponseEntity.notFound().build());
    }

    // 2. フォルダー削除（deleteDecks: trueなら中身ごと削除、falseならデッキのfolder_idをnullに解除）
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> deleteFolder(
            @PathVariable Long id,
            @RequestParam(defaultValue = "false") boolean deleteDecks,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {

        if (userIdHeader == null || userIdHeader.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UUID userId = UUID.fromString(userIdHeader);

            var folderOpt = folderRepository.findById(id);
        if (folderOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        var folder = folderOpt.get();

        if (!java.util.Objects.equals(folder.getUserId(), userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You do not have authority to delete the folder");
        }

        if (deleteDecks) {
        // ★ 中身も全削除: このフォルダーに所属するデッキを取得して一括削除
            deckRepository.deleteByFolderIdAndUserId(id, userId);
        } 
        
        folderRepository.delete(folder);
        return ResponseEntity.noContent().build();
    }
}