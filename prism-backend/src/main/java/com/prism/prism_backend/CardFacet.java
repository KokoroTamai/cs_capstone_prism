package com.prism.prism_backend;

import com.fasterxml.jackson.annotation.JsonBackReference;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "card_facets")
public class CardFacet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "facet_order", nullable = false)
    private int facetOrder;

    @Column(nullable = false, length = 50)
    private String label;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "card_id", nullable = false)
    @JsonBackReference // 無限ループ（循環参照）を防ぐためのアノテーション
    private Card card;

    public CardFacet() {}

    // ゲッター & セッター
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public int getFacetOrder() { return facetOrder; }
    public void setFacetOrder(int facetOrder) { this.facetOrder = facetOrder; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public Card getCard() { return card; }
    public void setCard(Card card) { this.card = card; }
}