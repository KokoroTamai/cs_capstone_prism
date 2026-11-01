package com.prism.prism_backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FolderRepository extends JpaRepository<Folder, Long> {
    List<Folder> findByUserIdOrderByCreatedAtDesc(UUID userId);
    Optional<Folder> findByUserIdAndName(UUID userId, String name);
    boolean existsByUserIdAndName(UUID userId, String name);
    List<Folder> findAllByUserIdAndName(UUID userId, String name);

    // ★ プール用（userId が null でフォルダー名が一致するもの）
    List<Folder> findByUserIdIsNullAndName(String name);
}