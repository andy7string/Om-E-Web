from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ChromeBridgeAction(BaseModel):
    """Base class for ChromeBridge actions"""
    timeout_ms: int = Field(default=5000, description="Timeout in milliseconds")

class ChromeBridgeEvalAction(ChromeBridgeAction):
    """Execute JavaScript in the browser"""
    script: str = Field(description="JavaScript code to execute")
    return_by_value: bool = Field(default=True, description="Return result by value")
    await_promise: bool = Field(default=True, description="Wait for promise resolution")

class ChromeBridgeProbeAction(ChromeBridgeAction):
    """Probe for elements using fast selectors"""
    selectors: List[str] = Field(description="CSS selectors to probe")
    include_text: bool = Field(default=True, description="Include element text content")
    include_attributes: bool = Field(default=True, description="Include element attributes")

class ChromeBridgeElement(BaseModel):
    """Element information returned from Chrome"""
    tag_name: str = Field(description="HTML tag name")
    text_content: Optional[str] = Field(description="Element text content")
    attributes: Dict[str, str] = Field(description="Element attributes")
    selector: str = Field(description="CSS selector for this element")
    is_clickable: bool = Field(description="Whether element is clickable")
    is_input: bool = Field(description="Whether element is an input field")
    is_visible: bool = Field(description="Whether element is visible")
