package com.prism.prism_backend;

import java.util.List;
import java.util.UUID;

public class CardCreateRequest {
    // ★ Long から UUID に変更
    private UUID deckId;
    private List<FacetDto> facets;

    public CardCreateRequest() {}

    public UUID getDeckId() { return deckId; }
    public void setDeckId(UUID deckId) { this.deckId = deckId; }

    public List<FacetDto> getFacets() { return facets; }
    public void setFacets(List<FacetDto> facets) { this.facets = facets; }

    public static class FacetDto {
        private String label;
        private String content;

        public FacetDto() {}

        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }

        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }
}