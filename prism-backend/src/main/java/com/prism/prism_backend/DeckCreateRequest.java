package com.prism.prism_backend;

public class DeckCreateRequest {
    private String title;
    private String description;
    private Long folder;

    public DeckCreateRequest() {}

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Long getFolder() { return folder; }
    
    // 数値として受け取った場合
    public void setFolder(Long folder) { 
        this.folder = folder; 
    }

    // フロントエンドから文字列（"" や "1" など）で渡された場合に対応
    public void setFolder(String folder) {
        if (folder != null && !folder.trim().isEmpty()) {
            try {
                this.folder = Long.parseLong(folder.trim());
            } catch (NumberFormatException e) {
                this.folder = null;
            }
        } else {
            this.folder = null;
        }
    }
}